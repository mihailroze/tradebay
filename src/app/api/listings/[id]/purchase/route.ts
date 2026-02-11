import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { getListingPricing } from "@/lib/pricing";
import { getEnvInt } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEscrowExpiresAt, releaseExpiredEscrows } from "@/lib/escrow";
import { notifyDealReserved } from "@/lib/notifications";
import { getRequestContext, logInfo, reportServerError } from "@/lib/observability";

const PURCHASE_RATE_LIMIT_PER_MINUTE = getEnvInt("PURCHASE_RATE_LIMIT_PER_MINUTE", 12);
const PURCHASE_DAILY_LIMIT_TC = getEnvInt("PURCHASE_DAILY_LIMIT_TC", 100000);
const PURCHASE_DAILY_OPS_LIMIT = getEnvInt("PURCHASE_DAILY_OPS_LIMIT", 50);

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function getUtcDayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseIdempotencyKey(req: Request, fallback: string) {
  const value = req.headers.get("idempotency-key")?.trim() || "";
  if (value && /^[a-zA-Z0-9:_-]{8,120}$/.test(value)) return value;
  return fallback;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = getRequestContext(req, "/api/listings/[id]/purchase");

  try {
    await releaseExpiredEscrows(25).catch(() => []);

    const tgUser = await getAuthTelegramUser();
    if (!tgUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit({
      key: `rate:purchase:${tgUser.id}`,
      limit: PURCHASE_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
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

    const fallbackKey = `purchase:${id}:${buyer.id}`;
    const idempotencyKey = parseIdempotencyKey(req, fallbackKey);
    const purchaseExternalId = `purchase:${id}:${buyer.id}:${idempotencyKey}`;

    const result = await prisma.$transaction(async (db) => {
      const listing = await db.listing.findUnique({
        where: { id },
        include: { seller: { select: { telegramId: true } } },
      });

      if (!listing) {
        throw new Error("Listing not available");
      }
      if (listing.status === "RESERVED" && listing.buyerId === buyer.id) {
        return {
          listing,
          sellerTelegramId: listing.seller?.telegramId ?? null,
          buyerTelegramId: String(tgUser.id),
          holdAmount: listing.holdAmount ?? 0,
          idempotent: true,
        };
      }
      if (listing.status !== "ACTIVE") {
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

      const todayStart = getUtcDayStart();
      const aggregate = await db.walletTransaction.aggregate({
        where: {
          walletId: buyerWallet.id,
          type: "PURCHASE",
          createdAt: { gte: todayStart },
          amount: { lt: 0 },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const spentToday = Math.abs(Number(aggregate._sum.amount || 0));
      const opsToday = Number(aggregate._count._all || 0);
      if (opsToday + 1 > PURCHASE_DAILY_OPS_LIMIT) {
        throw new Error("Daily purchase operations limit exceeded");
      }
      if (spentToday + totalStars > PURCHASE_DAILY_LIMIT_TC) {
        throw new Error("Daily purchase amount limit exceeded");
      }

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

      const existingPurchaseTx = await db.walletTransaction.findUnique({
        where: { externalId: purchaseExternalId },
      });
      if (!existingPurchaseTx) {
        await db.walletTransaction.create({
          data: {
            walletId: buyerWallet.id,
            type: "PURCHASE",
            status: "PENDING",
            amount: -totalStars,
            currency: "TC",
            listingId: listing.id,
            externalId: purchaseExternalId,
            idempotencyKey,
          },
        });
      }

      const updated = await db.listing.update({
        where: { id: listing.id },
        data: {
          status: "RESERVED",
          buyerId: buyer.id,
          reservedAt: new Date(),
          reservationExpiresAt: getEscrowExpiresAt(),
          holdAmount: totalStars,
          feeAmount: feeStars,
          disputedAt: null,
          disputeReason: null,
        },
      });

      return {
        listing: updated,
        sellerTelegramId: listing.seller?.telegramId ?? null,
        buyerTelegramId: String(tgUser.id),
        holdAmount: totalStars,
        idempotent: false,
      };
    });

    if (!result.idempotent) {
      await notifyDealReserved({
        listingId: result.listing.id,
        listingTitle: result.listing.title,
        buyerTelegramId: result.buyerTelegramId,
        sellerTelegramId: result.sellerTelegramId,
        amountTc: result.holdAmount,
      });
    }

    logInfo("Purchase reserved", requestContext, {
      listingId: result.listing.id,
      buyerTelegramId: result.buyerTelegramId,
      holdAmount: result.holdAmount,
      idempotencyKey,
      idempotent: result.idempotent,
    });

    return NextResponse.json({
      ok: true,
      listing: result.listing,
      idempotent: result.idempotent,
      idempotencyKey,
      requestId: requestContext.requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Purchase failed";
    if (
      message.includes("Listing") ||
      message.includes("Price") ||
      message.includes("Insufficient") ||
      message.includes("limit exceeded") ||
      message.includes("cannot buy your own")
    ) {
      return NextResponse.json({ error: message, requestId: requestContext.requestId }, { status: 400 });
    }
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Purchase failed", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}

