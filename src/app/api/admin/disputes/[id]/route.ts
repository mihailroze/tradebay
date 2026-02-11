import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser, isAdminTelegramId } from "@/lib/auth";
import {
  notifyEscrowReleased,
  refundEscrowByListingId,
  releaseEscrowByListingId,
} from "@/lib/escrow";
import { notifyDealRefund } from "@/lib/notifications";
import { getRequestContext, reportServerError } from "@/lib/observability";

const schema = z.object({
  action: z.enum(["RELEASE", "REFUND"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = getRequestContext(req, "/api/admin/disputes/[id]");

  try {
    const tgUser = await getAuthTelegramUser();
    if (!tgUser || !isAdminTelegramId(tgUser.id)) {
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
      select: { id: true, status: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.status !== "DISPUTED" && listing.status !== "RESERVED") {
      return NextResponse.json({ error: "Listing is not in dispute state" }, { status: 400 });
    }

    if (parsed.data.action === "RELEASE") {
      const result = await prisma.$transaction((db) => releaseEscrowByListingId(db, id));
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

    const result = await prisma.$transaction((db) =>
      refundEscrowByListingId(db, id, parsed.data.note || "admin_refund"),
    );
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

