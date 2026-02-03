import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { getListingPricing } from "@/lib/pricing";
import { Prisma } from "@prisma/client";

const TREASURY_TELEGRAM_ID = "treasury";
const TREASURY_USERNAME = "tradebay";
const TREASURY_DISPLAY_NAME = "TradeBay";

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

async function ensureTreasuryWallet(db: typeof prisma) {
  const user = await db.user.upsert({
    where: { telegramId: TREASURY_TELEGRAM_ID },
    update: {},
    create: {
      telegramId: TREASURY_TELEGRAM_ID,
      username: TREASURY_USERNAME,
      displayName: TREASURY_DISPLAY_NAME,
      lastSeenAt: new Date(),
    },
  });

  return db.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
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

      if (!listing || listing.status !== "RESERVED") {
        throw new Error("Listing not reserved");
      }
      if (listing.buyerId !== buyer.id) {
        throw new Error("Only the buyer can confirm the deal");
      }

      let totalStars = listing.holdAmount ?? 0;
      let feeStars = listing.feeAmount ?? 0;
      if (!totalStars && listing.price && listing.currency?.toUpperCase() === "RUB") {
        const baseRub = parseRubPrice(listing.price);
        if (baseRub) {
          const pricing = getListingPricing(baseRub);
          totalStars = pricing.totalStars;
          feeStars = pricing.feeStars;
        }
      }
      if (!Number.isFinite(totalStars) || totalStars <= 0) {
        throw new Error("Invalid hold amount");
      }
      if (!Number.isFinite(feeStars) || feeStars < 0) {
        throw new Error("Invalid fee amount");
      }

      const sellerAmount = Math.max(totalStars - feeStars, 0);

      const buyerWallet = await db.wallet.findUnique({ where: { userId: buyer.id } });
      if (!buyerWallet) {
        throw new Error("Buyer wallet not found");
      }
      if (buyerWallet.lockedBalance < totalStars) {
        throw new Error("Not enough reserved balance");
      }

      const sellerWallet = await db.wallet.upsert({
        where: { userId: listing.sellerId },
        update: {},
        create: { userId: listing.sellerId },
      });

      const treasuryWallet = feeStars > 0 ? await ensureTreasuryWallet(db) : null;

      await db.wallet.update({
        where: { id: buyerWallet.id },
        data: {
          lockedBalance: { decrement: totalStars },
        },
      });

      await db.wallet.update({
        where: { id: sellerWallet.id },
        data: {
          balance: { increment: sellerAmount },
        },
      });

      if (treasuryWallet) {
        await db.wallet.update({
          where: { id: treasuryWallet.id },
          data: {
            balance: { increment: feeStars },
          },
        });
      }

      await db.walletTransaction.updateMany({
        where: {
          walletId: buyerWallet.id,
          listingId: listing.id,
          type: "PURCHASE",
          status: "PENDING",
        },
        data: { status: "COMPLETED" },
      });

      await db.walletTransaction.create({
        data: {
          walletId: sellerWallet.id,
          type: "SALE",
          status: "COMPLETED",
          amount: sellerAmount,
          currency: "TC",
          listingId: listing.id,
        },
      });

      if (treasuryWallet) {
        await db.walletTransaction.create({
          data: {
            walletId: treasuryWallet.id,
            type: "FEE",
            status: "COMPLETED",
            amount: feeStars,
            currency: "TC",
            listingId: listing.id,
          },
        });
      }

      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { status: "SOLD" },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, listing: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
