import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser, isAdminTelegramId } from "@/lib/auth";
import { getListingPricing } from "@/lib/pricing";
import { Prisma } from "@prisma/client";

const schema = z.object({
  status: z.enum(["ACTIVE", "SOLD", "HIDDEN"]),
});

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      images: { select: { id: true } },
      tags: { include: { tag: true } },
      game: true,
      server: true,
      category: true,
      seller: { select: { id: true, telegramId: true, username: true, lastSeenAt: true } },
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tgUser = await getAuthTelegramUser();
  const isAdmin = tgUser ? isAdminTelegramId(tgUser.id) : false;
  const isOwner = tgUser ? listing.seller?.telegramId === String(tgUser.id) : false;
  let userRecord: { id: string } | null = null;
  if (tgUser) {
    userRecord = await prisma.user.findUnique({
      where: { telegramId: String(tgUser.id) },
      select: { id: true },
    });
  }
  const isBuyer = Boolean(userRecord && listing.buyerId === userRecord.id);

  if (listing.status !== "ACTIVE" && !isAdmin && !isOwner && !isBuyer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let isFavorite = false;
  let isReported = false;
  if (userRecord) {
      const favorite = await prisma.listingFavorite.findUnique({
        where: { userId_listingId: { userId: userRecord.id, listingId: listing.id } },
        select: { listingId: true },
      });
      isFavorite = Boolean(favorite);
      const report = await prisma.listingReport.findUnique({
        where: {
          listingId_reporterId: {
            listingId: listing.id,
            reporterId: userRecord.id,
          },
        },
        select: { id: true },
      });
      isReported = Boolean(report);
  }

  let pricing: ReturnType<typeof getListingPricing> | null = null;
  if (listing.type === "SALE" && listing.currency?.toUpperCase() === "RUB" && listing.price) {
    const baseRub = parseRubPrice(listing.price);
    if (baseRub) {
      pricing = getListingPricing(baseRub);
    }
  }

  const seller = listing.seller
    ? {
        id: listing.seller.id,
        username: listing.seller.username,
        lastSeenAt: listing.seller.lastSeenAt,
      }
    : null;

  return NextResponse.json({
    listing: {
      ...listing,
      seller,
      isFavorite,
      isReported,
      isBuyer,
      priceStars: pricing?.totalStars ?? null,
      feeStars: pricing?.feeStars ?? null,
      feePercent: pricing?.feePercent ?? null,
    },
  });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.upsert({
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

  const { id } = await context.params;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { seller: true },
  });

  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = listing.seller.telegramId === String(tgUser.id);
  const isAdmin = isAdminTelegramId(tgUser.id);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: { status: parsed.data.status },
  });

  if (parsed.data.status !== "ACTIVE") {
    await prisma.image.deleteMany({ where: { listingId: listing.id } });
  }

  return NextResponse.json({ listing: updated });
}
