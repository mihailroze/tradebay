import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEnvInt } from "@/lib/env";
import { sendOpsAlert } from "@/lib/alerts";
import { getRequestContext, reportServerError } from "@/lib/observability";

const schema = z.object({
  reason: z.string().trim().min(4).max(500),
});

const DISPUTE_RATE_LIMIT_PER_MINUTE = getEnvInt("DISPUTE_RATE_LIMIT_PER_MINUTE", 10);

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

    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: "DISPUTED",
        disputedAt: new Date(),
        disputeReason: parsed.data.reason,
      },
    });

    await sendOpsAlert(
      "Deal marked as disputed",
      `listing=${listing.id}\nreporter=${user.telegramId}\nreason=${parsed.data.reason}`,
    );

    return NextResponse.json({ ok: true, listing: updated });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to open dispute", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}

