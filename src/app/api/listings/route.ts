import { Buffer } from "buffer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(["SALE", "TRADE"]),
  price: z.number().positive().optional(),
  currency: z.string().min(1).max(8).optional(),
  tradeNote: z.string().min(3).max(1000).optional(),
  contactAlt: z.string().min(3).max(120).optional(),
  gameId: z.string().cuid(),
  serverId: z.string().cuid().optional().nullable(),
  categoryId: z.string().cuid().optional().nullable(),
  tagIds: z.array(z.string().cuid()).max(12).optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || undefined;
  const gameId = searchParams.get("gameId") || undefined;
  const serverId = searchParams.get("serverId") || undefined;
  const categoryId = searchParams.get("categoryId") || undefined;
  const tagId = searchParams.get("tagId") || undefined;
  const type = searchParams.get("type") || undefined;
  const payableOnly = searchParams.get("payable") === "1" || searchParams.get("payable") === "true";
  const sort = (searchParams.get("sort") || "NEWEST").toUpperCase();
  const pageRaw = Number(searchParams.get("page"));
  const pageSizeRaw = Number(searchParams.get("pageSize"));
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(50, Math.max(10, pageSizeRaw)) : 20;

  const where: Prisma.ListingWhereInput = {
    status: "ACTIVE" as const,
    gameId,
    serverId,
    categoryId,
    type: type === "SALE" || type === "TRADE" ? type : undefined,
    ...(payableOnly
      ? {
          type: "SALE",
          currency: { equals: "RUB", mode: Prisma.QueryMode.insensitive },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
            { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
    ...(tagId
      ? {
          tags: { some: { tagId } },
        }
      : {}),
  };

  const orderBy =
    sort === "PRICE_ASC"
      ? [{ price: "asc" as const }, { createdAt: "desc" as const }]
      : sort === "PRICE_DESC"
        ? [{ price: "desc" as const }, { createdAt: "desc" as const }]
        : sort === "OLDEST"
          ? [{ createdAt: "asc" as const }]
          : [{ createdAt: "desc" as const }];

  const [total, listings] = await prisma.$transaction([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      include: {
        images: { select: { id: true } },
        tags: { include: { tag: true } },
        game: true,
        server: true,
        category: true,
        seller: { select: { username: true, lastSeenAt: true } },
      },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
  ]);

  const tgUser = await getAuthTelegramUser();
  let favoriteIds = new Set<string>();
  if (tgUser && listings.length) {
    const user = await prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) },
      select: { id: true },
    });
    if (user) {
      const favorites = await prisma.listingFavorite.findMany({
        where: {
          userId: user.id,
          listingId: { in: listings.map((listing) => listing.id) },
        },
        select: { listingId: true },
      });
      favoriteIds = new Set(favorites.map((fav) => fav.listingId));
    }
  }

  const listingsWithFavorite = listings.map((listing) => ({
    ...listing,
    isFavorite: favoriteIds.has(listing.id),
  }));

  return NextResponse.json({ listings: listingsWithFavorite, total, page, pageSize });
}

export async function POST(req: Request) {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");
  const { payload, images } = isMultipart ? await parseFormPayload(req) : { payload: await parseJsonPayload(req), images: [] };

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const parsedPayload = parsed.data;
  const hasUsername = Boolean(tgUser.username);
  const contactAlt = parsedPayload.contactAlt?.trim();
  if (!hasUsername && !contactAlt) {
    return NextResponse.json({ error: "Contact required" }, { status: 400 });
  }

  if (parsedPayload.type === "SALE") {
    if (!parsedPayload.price || !parsedPayload.currency) {
      return NextResponse.json({ error: "Price and currency required for sale" }, { status: 400 });
    }
    if (parsedPayload.currency.toUpperCase() === "RUB" && !Number.isInteger(parsedPayload.price)) {
      return NextResponse.json({ error: "RUB price must be a whole number" }, { status: 400 });
    }
  }
  if (parsedPayload.type === "TRADE" && !parsedPayload.tradeNote) {
    return NextResponse.json({ error: "Trade note required for trade" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { telegramId: String(tgUser.id) },
    update: {
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
    create: {
      telegramId: String(tgUser.id),
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
  });

  let imageCreates = [];
  try {
    imageCreates = await buildImages(images);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image upload failed" }, { status: 400 });
  }

  const listing = await prisma.listing.create({
    data: {
      title: parsedPayload.title,
      description: parsedPayload.description ?? null,
      type: parsedPayload.type,
      price: parsedPayload.price ?? null,
      currency: parsedPayload.currency ? parsedPayload.currency.toUpperCase() : null,
      tradeNote: parsedPayload.tradeNote ?? null,
      contactAlt: contactAlt ?? null,
      gameId: parsedPayload.gameId,
      serverId: parsedPayload.serverId ?? null,
      categoryId: parsedPayload.categoryId ?? null,
      sellerId: user.id,
      images: imageCreates.length
        ? {
            create: imageCreates,
          }
        : undefined,
      tags: parsedPayload.tagIds
        ? {
            create: parsedPayload.tagIds.map((tagId) => ({ tagId })),
          }
        : undefined,
    },
  });

  return NextResponse.json({ listing });
}

async function parseJsonPayload(req: Request) {
  const body = await req.json();
  return body;
}

async function parseFormPayload(req: Request) {
  const form = await req.formData();
  const tagIds = form.getAll("tagIds").map((value) => String(value));
  const images = form.getAll("images").filter((value): value is File => value instanceof File);

  const payload = {
    title: String(form.get("title") || ""),
    description: form.get("description") ? String(form.get("description")) : undefined,
    type: String(form.get("type") || "SALE"),
    price: form.get("price") ? Number(form.get("price")) : undefined,
    currency: form.get("currency") ? String(form.get("currency")) : undefined,
    tradeNote: form.get("tradeNote") ? String(form.get("tradeNote")) : undefined,
    contactAlt: form.get("contactAlt") ? String(form.get("contactAlt")) : undefined,
    gameId: String(form.get("gameId") || ""),
    serverId: form.get("serverId") ? String(form.get("serverId")) : undefined,
    categoryId: form.get("categoryId") ? String(form.get("categoryId")) : undefined,
    tagIds: tagIds.length ? tagIds : undefined,
  };

  return { payload, images };
}

async function buildImages(files: File[]) {
  if (!files.length) return [];
  if (files.length > MAX_IMAGES) {
    throw new Error(`Maximum ${MAX_IMAGES} images allowed`);
  }

  const results = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("Only JPG, PNG, WEBP are allowed");
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Image size must be <= ${Math.floor(MAX_IMAGE_SIZE / (1024 * 1024))}MB`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    results.push({
      data: buffer,
      contentType: file.type,
      fileName: file.name,
      size: file.size,
    });
  }

  return results;
}
