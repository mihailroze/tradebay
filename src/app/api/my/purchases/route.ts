import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { getListingPricing } from "@/lib/pricing";
import { Prisma } from "@prisma/client";
import { releaseExpiredEscrows } from "@/lib/escrow";

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function GET() {
  await releaseExpiredEscrows(25).catch(() => []);
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const listings = await prisma.listing.findMany({
    where: {
      buyerId: user.id,
      status: { in: ["RESERVED", "DISPUTED", "SOLD"] },
    },
    orderBy: [{ reservedAt: "desc" }, { createdAt: "desc" }],
    include: {
      images: { select: { id: true } },
      tags: { include: { tag: true } },
      game: true,
      server: true,
      category: true,
      seller: { select: { username: true, lastSeenAt: true } },
    },
  });

  const listingsWithPricing = listings.map((listing) => {
    let pricing: ReturnType<typeof getListingPricing> | null = null;
    if (listing.type === "SALE" && listing.currency?.toUpperCase() === "RUB" && listing.price) {
      const baseRub = parseRubPrice(listing.price);
      if (baseRub) {
        pricing = getListingPricing(baseRub);
      }
    }
    return {
      ...listing,
      priceStars: pricing?.totalStars ?? null,
      feeStars: pricing?.feeStars ?? null,
      feePercent: pricing?.feePercent ?? null,
    };
  });

  return NextResponse.json({ listings: listingsWithPricing });
}
