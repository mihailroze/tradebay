import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEnvInt } from "@/lib/env";
import {
  notifyEscrowReleased,
  releaseEscrowByListingId,
  releaseExpiredEscrows,
} from "@/lib/escrow";
import { getRequestContext, logInfo, reportServerError } from "@/lib/observability";

const CONFIRM_RATE_LIMIT_PER_MINUTE = getEnvInt("CONFIRM_RATE_LIMIT_PER_MINUTE", 20);

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = getRequestContext(req, "/api/listings/[id]/confirm");

  try {
    await releaseExpiredEscrows(25).catch(() => []);

    const tgUser = await getAuthTelegramUser();
    if (!tgUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit({
      key: `rate:confirm:${tgUser.id}`,
      limit: CONFIRM_RATE_LIMIT_PER_MINUTE,
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

    const listingBefore = await prisma.listing.findUnique({
      where: { id },
      include: {
        seller: { select: { telegramId: true } },
        buyer: { select: { telegramId: true } },
      },
    });
    if (!listingBefore) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listingBefore.buyerId !== buyer.id) {
      return NextResponse.json({ error: "Only buyer can confirm the deal" }, { status: 403 });
    }
    if (listingBefore.status === "SOLD") {
      return NextResponse.json({
        ok: true,
        listing: listingBefore,
        idempotent: true,
        requestId: requestContext.requestId,
      });
    }
    if (listingBefore.status !== "RESERVED") {
      return NextResponse.json({ error: "Listing not reserved" }, { status: 400 });
    }

    const result = await prisma.$transaction((db) => releaseEscrowByListingId(db, id));

    await notifyEscrowReleased({
      listingId: result.listing.id,
      listingTitle: result.listing.title,
      buyerTelegramId: result.buyerTelegramId,
      sellerTelegramId: result.sellerTelegramId,
      sellerAmount: result.sellerAmount,
      feeAmount: result.feeAmount,
    });

    logInfo("Escrow released", requestContext, {
      listingId: result.listing.id,
      buyerTelegramId: result.buyerTelegramId,
      sellerAmount: result.sellerAmount,
      feeAmount: result.feeAmount,
    });

    return NextResponse.json({
      ok: true,
      listing: result.listing,
      requestId: requestContext.requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirmation failed";
    if (
      message.includes("listing_not_found") ||
      message.includes("buyer_not_found") ||
      message.includes("invalid_")
    ) {
      return NextResponse.json({ error: message, requestId: requestContext.requestId }, { status: 400 });
    }
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Confirmation failed", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}

