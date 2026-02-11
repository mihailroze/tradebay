import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getEnvInt } from "@/lib/env";
import { requireAdminUser } from "@/lib/admin";
import {
  notifyEscrowReleased,
  refundEscrowByListingId,
  releaseEscrowByListingId,
} from "@/lib/escrow";
import { notifyDealRefund, notifyDisputeReview } from "@/lib/notifications";
import { getRequestContext, reportServerError } from "@/lib/observability";

const DISPUTE_SLA_HOURS = getEnvInt("DISPUTE_SLA_HOURS", 24);

const schema = z.object({
  action: z.enum(["RELEASE", "REFUND", "SET_IN_REVIEW"]),
  note: z.string().trim().max(500).optional(),
  template: z
    .enum([
      "ITEM_NOT_DELIVERED",
      "ITEM_NOT_AS_DESCRIBED",
      "SELLER_CONFIRMED",
      "BUYER_CONFIRMED",
      "FRAUD_SUSPECT",
      "OTHER",
    ])
    .optional(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = getRequestContext(req, "/api/admin/disputes/[id]");

  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { id } = await context.params;
    const listing = await prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        buyerId: true,
        sellerId: true,
        disputedAt: true,
        reservedAt: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.status !== "DISPUTED" && listing.status !== "RESERVED") {
      return NextResponse.json({ error: "Listing is not in dispute state" }, { status: 400 });
    }

    if (parsed.data.action === "SET_IN_REVIEW") {
      const now = new Date();
      const openedAt = listing.disputedAt ?? listing.reservedAt ?? now;
      const slaDeadlineAt = new Date(openedAt.getTime() + DISPUTE_SLA_HOURS * 60 * 60 * 1000);
      const result = await prisma.$transaction(async (db) => {
        const disputeCase = await db.disputeCase.upsert({
          where: { listingId: id },
          update: {
            status: "IN_REVIEW",
            assignedAdminId: admin.id,
            firstResponseAt: now,
            slaDeadlineAt,
            resolutionTemplate: parsed.data.template ?? null,
            resolutionNote: parsed.data.note ?? null,
          },
          create: {
            listingId: id,
            openedById: listing.buyerId || listing.sellerId,
            assignedAdminId: admin.id,
            status: "IN_REVIEW",
            openedAt,
            firstResponseAt: now,
            slaDeadlineAt,
            resolutionTemplate: parsed.data.template ?? null,
            resolutionNote: parsed.data.note ?? null,
          },
        });

        await db.disputeCaseEvent.create({
          data: {
            disputeCaseId: disputeCase.id,
            actorUserId: admin.id,
            type: "MARK_IN_REVIEW",
            note: parsed.data.note ?? null,
            meta: parsed.data.template ? { template: parsed.data.template } : undefined,
          },
        });

        return { disputeCase };
      });

      const listingWithUsers = await prisma.listing.findUnique({
        where: { id },
        include: {
          seller: { select: { telegramId: true } },
          buyer: { select: { telegramId: true } },
        },
      });
      if (listingWithUsers) {
        await notifyDisputeReview({
          listingId: listingWithUsers.id,
          listingTitle: listingWithUsers.title,
          buyerTelegramId: listingWithUsers.buyer?.telegramId ?? null,
          sellerTelegramId: listingWithUsers.seller?.telegramId ?? null,
          note: parsed.data.note ?? null,
        });
      }

      return NextResponse.json({
        ok: true,
        action: "SET_IN_REVIEW",
        disputeCase: result.disputeCase,
      });
    }

    if (parsed.data.action === "RELEASE") {
      const result = await prisma.$transaction(async (db) => {
        const releaseResult = await releaseEscrowByListingId(db, id);
        const now = new Date();
        const disputeCase = await db.disputeCase.upsert({
          where: { listingId: id },
          update: {
            status: "RESOLVED_RELEASED",
            assignedAdminId: admin.id,
            firstResponseAt: now,
            resolvedAt: now,
            resolutionTemplate: parsed.data.template ?? null,
            resolutionNote: parsed.data.note ?? null,
          },
          create: {
            listingId: id,
            openedById: releaseResult.listing.buyerId || releaseResult.listing.sellerId,
            assignedAdminId: admin.id,
            status: "RESOLVED_RELEASED",
            openedAt: now,
            firstResponseAt: now,
            resolvedAt: now,
            resolutionTemplate: parsed.data.template ?? null,
            resolutionNote: parsed.data.note ?? null,
          },
        });
        await db.disputeCaseEvent.create({
          data: {
            disputeCaseId: disputeCase.id,
            actorUserId: admin.id,
            type: "RESOLVED_RELEASE",
            note: parsed.data.note ?? null,
            meta: parsed.data.template ? { template: parsed.data.template } : undefined,
          },
        });
        return releaseResult;
      });
      await notifyEscrowReleased({
        listingId: result.listing.id,
        listingTitle: result.listing.title,
        buyerTelegramId: result.buyerTelegramId,
        sellerTelegramId: result.sellerTelegramId,
        sellerAmount: result.sellerAmount,
        feeAmount: result.feeAmount,
      });
      return NextResponse.json({ ok: true, listing: result.listing, action: "RELEASE" });
    }

    const result = await prisma.$transaction(async (db) => {
      const refundResult = await refundEscrowByListingId(
        db,
        id,
        parsed.data.note || "admin_refund",
      );
      const now = new Date();
      const disputeCase = await db.disputeCase.upsert({
        where: { listingId: id },
        update: {
          status: "RESOLVED_REFUNDED",
          assignedAdminId: admin.id,
          firstResponseAt: now,
          resolvedAt: now,
          resolutionTemplate: parsed.data.template ?? null,
          resolutionNote: parsed.data.note ?? null,
        },
        create: {
          listingId: id,
          openedById: refundResult.listing.buyerId || refundResult.listing.sellerId,
          assignedAdminId: admin.id,
          status: "RESOLVED_REFUNDED",
          openedAt: now,
          firstResponseAt: now,
          resolvedAt: now,
          resolutionTemplate: parsed.data.template ?? null,
          resolutionNote: parsed.data.note ?? null,
        },
      });
      await db.disputeCaseEvent.create({
        data: {
          disputeCaseId: disputeCase.id,
          actorUserId: admin.id,
          type: "RESOLVED_REFUND",
          note: parsed.data.note ?? null,
          meta: parsed.data.template ? { template: parsed.data.template } : undefined,
        },
      });
      return refundResult;
    });
    await notifyDealRefund(
      {
        listingId: result.listing.id,
        listingTitle: result.listing.title,
        buyerTelegramId: result.buyerTelegramId,
        sellerTelegramId: result.sellerTelegramId,
        amountTc: result.refundedAmount,
      },
      "admin_refund",
    );
    return NextResponse.json({ ok: true, listing: result.listing, action: "REFUND" });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to resolve dispute", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}
