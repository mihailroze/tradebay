import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { getListingPricing } from "@/lib/pricing";

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const buyer = await prisma.user.upsert({
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

  try {
    const result = await prisma.$transaction(async (db) => {
      const listing = await db.listing.findUnique({
        where: { id },
        include: { seller: true },
      });

      if (!listing || listing.status !== "ACTIVE") {
        throw new Error("Listing not available");
      }
      if (listing.type !== "SALE") {
        throw new Error("Listing is not for sale");
      }
      if (!listing.price || !listing.currency) {
        throw new Error("Listing price not set");
      }
      if (listing.currency.toUpperCase() !== "RUB") {
        throw new Error("Only RUB listings can be purchased with Trade Coin");
      }
      if (listing.sellerId === buyer.id) {
        throw new Error("You cannot buy your own listing");
      }

      const baseRub = parseRubPrice(listing.price);
      if (!baseRub) {
        throw new Error("Price must be a whole number of rubles");
      }
      const pricing = getListingPricing(baseRub);
      const totalStars = pricing.totalStars;
      const feeStars = pricing.feeStars;

      const buyerWallet = await db.wallet.upsert({
        where: { userId: buyer.id },
        update: {},
        create: { userId: buyer.id },
      });

      if (buyerWallet.balance < totalStars) {
        throw new Error("Insufficient balance");
      }

      await db.wallet.update({
        where: { id: buyerWallet.id },
        data: {
          balance: { decrement: totalStars },
          lockedBalance: { increment: totalStars },
        },
      });

      await db.walletTransaction.create({
        data: {
          walletId: buyerWallet.id,
          type: "PURCHASE",
          status: "PENDING",
          amount: -totalStars,
          currency: "TC",
          listingId: listing.id,
        },
      });

      const updated = await db.listing.update({
        where: { id: listing.id },
        data: {
          status: "RESERVED",
          buyerId: buyer.id,
          reservedAt: new Date(),
          holdAmount: totalStars,
          feeAmount: feeStars,
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, listing: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
