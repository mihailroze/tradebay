import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnvInt, normalizeEnvValue } from "@/lib/env";
import { getListingPricing } from "@/lib/pricing";
import { notifyDealRefund, notifyDealSold } from "@/lib/notifications";

const TREASURY_TELEGRAM_ID = normalizeEnvValue(process.env.TREASURY_TELEGRAM_ID) || "treasury";
const TREASURY_USERNAME = normalizeEnvValue(process.env.TREASURY_USERNAME) || "tradebay";
const TREASURY_DISPLAY_NAME = normalizeEnvValue(process.env.TREASURY_DISPLAY_NAME) || "TradeBay";

export function getEscrowTtlMinutes() {
  return Math.max(5, getEnvInt("ESCROW_TTL_MINUTES", 24 * 60));
}

export function getEscrowExpiresAt(baseDate = new Date()) {
  return new Date(baseDate.getTime() + getEscrowTtlMinutes() * 60 * 1000);
}

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function calculateEscrowAmounts(listing: {
  holdAmount: number | null;
  feeAmount: number | null;
  price: Prisma.Decimal | null;
  currency: string | null;
}) {
  let holdAmount = listing.holdAmount ?? 0;
  let feeAmount = listing.feeAmount ?? 0;

  if (!holdAmount && listing.price && listing.currency?.toUpperCase() === "RUB") {
    const baseRub = parseRubPrice(listing.price);
    if (baseRub) {
      const pricing = getListingPricing(baseRub);
      holdAmount = pricing.totalStars;
      feeAmount = pricing.feeStars;
    }
  }

  if (!Number.isFinite(holdAmount) || holdAmount <= 0) {
    throw new Error("invalid_hold_amount");
  }
  if (!Number.isFinite(feeAmount) || feeAmount < 0) {
    throw new Error("invalid_fee_amount");
  }
  if (feeAmount > holdAmount) {
    throw new Error("invalid_fee_amount");
  }

  return { holdAmount, feeAmount };
}

export async function ensureTreasuryWallet(db: Prisma.TransactionClient | typeof prisma) {
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

async function createWalletTransactionOnce(
  db: Prisma.TransactionClient,
  data: Prisma.WalletTransactionCreateInput & { externalId: string },
) {
  const existing = await db.walletTransaction.findUnique({
    where: { externalId: data.externalId },
  });
  if (existing) return existing;

  try {
    return await db.walletTransaction.create({ data });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const afterConflict = await db.walletTransaction.findUnique({
        where: { externalId: data.externalId },
      });
      if (afterConflict) return afterConflict;
    }
    throw error;
  }
}

export async function refundEscrowByListingId(
  db: Prisma.TransactionClient,
  listingId: string,
  reason: string,
) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      seller: { select: { telegramId: true } },
      buyer: { select: { telegramId: true } },
    },
  });

  if (!listing) throw new Error("listing_not_found");
  if (!listing.buyerId) throw new Error("buyer_not_found");
  if (!["RESERVED", "DISPUTED"].includes(listing.status)) {
    return {
      listing,
      buyerTelegramId: listing.buyer?.telegramId ?? null,
      sellerTelegramId: listing.seller?.telegramId ?? null,
      holdAmount: 0,
      refundedAmount: 0,
      sellerAmount: 0,
      feeAmount: 0,
    };
  }

  const { holdAmount, feeAmount } = calculateEscrowAmounts(listing);
  const buyerWallet = await db.wallet.upsert({
    where: { userId: listing.buyerId },
    update: {},
    create: { userId: listing.buyerId },
  });

  const refundableAmount = Math.min(holdAmount, buyerWallet.lockedBalance);
  if (refundableAmount > 0) {
    await db.wallet.update({
      where: { id: buyerWallet.id },
      data: {
        lockedBalance: { decrement: refundableAmount },
        balance: { increment: refundableAmount },
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
    data: {
      status: "FAILED",
      errorMessage: reason,
    },
  });

  await createWalletTransactionOnce(db, {
    wallet: { connect: { id: buyerWallet.id } },
    type: "REFUND",
    status: "COMPLETED",
    amount: refundableAmount,
    currency: "TC",
    listing: { connect: { id: listing.id } },
    externalId: `refund:${listing.id}`,
    payload: `reason:${reason}`,
  });

  const updatedListing = await db.listing.update({
    where: { id: listing.id },
    data: {
      status: "ACTIVE",
      buyerId: null,
      reservedAt: null,
      reservationExpiresAt: null,
      holdAmount: null,
      feeAmount: null,
      disputedAt: null,
      disputeReason: null,
    },
    include: {
      seller: { select: { telegramId: true } },
      buyer: { select: { telegramId: true } },
    },
  });

  return {
    listing: updatedListing,
    buyerTelegramId: listing.buyer?.telegramId ?? null,
    sellerTelegramId: listing.seller?.telegramId ?? null,
    holdAmount,
    refundedAmount: refundableAmount,
    sellerAmount: 0,
    feeAmount,
  };
}

export async function releaseEscrowByListingId(
  db: Prisma.TransactionClient,
  listingId: string,
) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      seller: { select: { telegramId: true } },
      buyer: { select: { telegramId: true } },
    },
  });

  if (!listing) throw new Error("listing_not_found");
  if (!listing.buyerId) throw new Error("buyer_not_found");
  if (!["RESERVED", "DISPUTED"].includes(listing.status)) {
    return {
      listing,
      buyerTelegramId: listing.buyer?.telegramId ?? null,
      sellerTelegramId: listing.seller?.telegramId ?? null,
      holdAmount: 0,
      sellerAmount: 0,
      feeAmount: 0,
    };
  }

  const { holdAmount, feeAmount } = calculateEscrowAmounts(listing);
  const buyerWallet = await db.wallet.upsert({
    where: { userId: listing.buyerId },
    update: {},
    create: { userId: listing.buyerId },
  });
  const sellerWallet = await db.wallet.upsert({
    where: { userId: listing.sellerId },
    update: {},
    create: { userId: listing.sellerId },
  });

  const releasableAmount = Math.min(holdAmount, buyerWallet.lockedBalance);
  const normalizedFee = Math.min(feeAmount, releasableAmount);
  const sellerAmount = Math.max(releasableAmount - normalizedFee, 0);

  if (releasableAmount > 0) {
    await db.wallet.update({
      where: { id: buyerWallet.id },
      data: {
        lockedBalance: { decrement: releasableAmount },
      },
    });
  }

  if (sellerAmount > 0) {
    await db.wallet.update({
      where: { id: sellerWallet.id },
      data: {
        balance: { increment: sellerAmount },
      },
    });
  }

  if (normalizedFee > 0) {
    const treasuryWallet = await ensureTreasuryWallet(db);
    await db.wallet.update({
      where: { id: treasuryWallet.id },
      data: {
        balance: { increment: normalizedFee },
      },
    });

    await createWalletTransactionOnce(db, {
      wallet: { connect: { id: treasuryWallet.id } },
      type: "FEE",
      status: "COMPLETED",
      amount: normalizedFee,
      currency: "TC",
      listing: { connect: { id: listing.id } },
      externalId: `fee:${listing.id}`,
      payload: "escrow_release",
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

  await createWalletTransactionOnce(db, {
    wallet: { connect: { id: sellerWallet.id } },
    type: "SALE",
    status: "COMPLETED",
    amount: sellerAmount,
    currency: "TC",
    listing: { connect: { id: listing.id } },
    externalId: `sale:${listing.id}`,
    payload: "escrow_release",
  });

  const updatedListing = await db.listing.update({
    where: { id: listing.id },
    data: {
      status: "SOLD",
      reservationExpiresAt: null,
      disputedAt: null,
      disputeReason: null,
    },
    include: {
      seller: { select: { telegramId: true } },
      buyer: { select: { telegramId: true } },
    },
  });

  return {
    listing: updatedListing,
    buyerTelegramId: listing.buyer?.telegramId ?? null,
    sellerTelegramId: listing.seller?.telegramId ?? null,
    holdAmount: releasableAmount,
    sellerAmount,
    feeAmount: normalizedFee,
  };
}

export async function releaseExpiredEscrows(limit = 50) {
  const now = new Date();
  const fallbackExpiry = new Date(now.getTime() - getEscrowTtlMinutes() * 60 * 1000);
  const candidates = await prisma.listing.findMany({
    where: {
      status: "RESERVED",
      OR: [
        {
          reservationExpiresAt: {
            lte: now,
          },
        },
        {
          reservationExpiresAt: null,
          reservedAt: {
            lte: fallbackExpiry,
          },
        },
      ],
    },
    orderBy: [{ reservationExpiresAt: "asc" }, { reservedAt: "asc" }],
    take: limit,
    select: { id: true },
  });

  const results: Array<{
    listingId: string;
    listingTitle: string;
    buyerTelegramId: string | null;
    sellerTelegramId: string | null;
    refundedAmount: number;
  }> = [];

  for (const item of candidates) {
    const txResult = await prisma.$transaction((db) =>
      refundEscrowByListingId(db, item.id, "escrow_timeout"),
    );
    results.push({
      listingId: txResult.listing.id,
      listingTitle: txResult.listing.title,
      buyerTelegramId: txResult.buyerTelegramId,
      sellerTelegramId: txResult.sellerTelegramId,
      refundedAmount: txResult.refundedAmount,
    });
  }

  await Promise.allSettled(
    results.map((item) =>
      notifyDealRefund(
        {
          listingId: item.listingId,
          listingTitle: item.listingTitle,
          buyerTelegramId: item.buyerTelegramId,
          sellerTelegramId: item.sellerTelegramId,
          amountTc: item.refundedAmount,
        },
        "timeout",
      ),
    ),
  );

  return results;
}

export async function notifyEscrowReleased(params: {
  listingId: string;
  listingTitle: string;
  buyerTelegramId: string | null;
  sellerTelegramId: string | null;
  sellerAmount: number;
  feeAmount: number;
}) {
  await notifyDealSold({
    listingId: params.listingId,
    listingTitle: params.listingTitle,
    buyerTelegramId: params.buyerTelegramId,
    sellerTelegramId: params.sellerTelegramId,
    amountTc: params.sellerAmount,
    feeTc: params.feeAmount,
  });
}
