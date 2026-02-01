import { Buffer } from "buffer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData } from "@/lib/auth";

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

  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      gameId,
      serverId,
      categoryId,
      type: type === "SALE" || type === "TRADE" ? type : undefined,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(tagId
        ? {
            tags: { some: { tagId } },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      images: { select: { id: true } },
      tags: { include: { tag: true } },
      game: true,
      server: true,
      category: true,
      seller: { select: { username: true } },
    },
    take: 50,
  });

  return NextResponse.json({ listings });
}

export async function POST(req: Request) {
  const initData = getTelegramInitDataFromHeaders();
  const tgUser = getTelegramUserFromInitData(initData);
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
  }
  if (parsedPayload.type === "TRADE" && !parsedPayload.tradeNote) {
    return NextResponse.json({ error: "Trade note required for trade" }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { telegramId: String(tgUser.id) },
    update: {
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
    },
    create: {
      telegramId: String(tgUser.id),
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
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
      currency: parsedPayload.currency ?? null,
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
    throw new Error(`Максимум ${MAX_IMAGES} изображений`);
  }

  const results = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("Поддерживаются только JPG, PNG, WEBP");
    }
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`Размер изображения не более ${Math.floor(MAX_IMAGE_SIZE / (1024 * 1024))}MB`);
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
