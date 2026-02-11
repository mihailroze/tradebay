import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEnvInt } from "@/lib/env";
import { sendOpsAlert } from "@/lib/alerts";
import { getRequestContext, reportServerError } from "@/lib/observability";
import { notifyDisputeOpened } from "@/lib/notifications";

const schema = z.object({
  reason: z.string().trim().min(4).max(500),
});

const DISPUTE_RATE_LIMIT_PER_MINUTE = getEnvInt("DISPUTE_RATE_LIMIT_PER_MINUTE", 10);
const DISPUTE_SLA_HOURS = getEnvInt("DISPUTE_SLA_HOURS", 24);

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = getRequestContext(req, "/api/listings/[id]/dispute");

  try {
    const tgUser = await getAuthTelegramUser();
    if (!tgUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit({
      key: `rate:dispute:${tgUser.id}`,
      limit: DISPUTE_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

    const { id } = await context.params;
    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        seller: { select: { telegramId: true } },
        buyer: { select: { telegramId: true } },
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.status !== "RESERVED") {
      return NextResponse.json({ error: "Only reserved deals can be disputed" }, { status: 400 });
    }
    if (listing.buyerId !== user.id && listing.sellerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const openedAt = listing.disputedAt ?? listing.reservedAt ?? now;
    const slaDeadlineAt = new Date(openedAt.getTime() + DISPUTE_SLA_HOURS * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (db) => {
      const updatedListing = await db.listing.update({
        where: { id: listing.id },
        data: {
          status: "DISPUTED",
          disputedAt: now,
          disputeReason: parsed.data.reason,
        },
      });

      const disputeCase = await db.disputeCase.upsert({
        where: { listingId: listing.id },
        update: {
          status: "OPEN",
          openedById: user.id,
          openedAt,
          firstResponseAt: null,
          resolvedAt: null,
          assignedAdminId: null,
          resolutionTemplate: null,
          resolutionNote: null,
          slaDeadlineAt,
        },
        create: {
          listingId: listing.id,
          status: "OPEN",
          openedById: user.id,
          openedAt,
          slaDeadlineAt,
        },
      });

      await db.disputeCaseEvent.create({
        data: {
          disputeCaseId: disputeCase.id,
          actorUserId: user.id,
          type: "OPENED",
          note: parsed.data.reason,
          meta: {
            openedByTelegramId: String(tgUser.id),
          },
        },
      });

      return updatedListing;
    });

    await sendOpsAlert(
      "Deal marked as disputed",
      `listing=${listing.id}\nreporter=${user.telegramId}\nreason=${parsed.data.reason}`,
    );
    await notifyDisputeOpened({
      listingId: listing.id,
      listingTitle: listing.title,
      buyerTelegramId: listing.buyer?.telegramId ?? null,
      sellerTelegramId: listing.seller?.telegramId ?? null,
      reason: parsed.data.reason,
      slaHours: DISPUTE_SLA_HOURS,
    });

    return NextResponse.json({ ok: true, listing: updated });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to open dispute", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}
