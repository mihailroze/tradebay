import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { getEnvInt } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendOpsAlert } from "@/lib/alerts";
import { getRequestContext, reportServerError } from "@/lib/observability";

const schema = z.object({
  reason: z.string().trim().min(4).max(500),
});

const REPORT_RATE_LIMIT_PER_MINUTE = getEnvInt("REPORT_RATE_LIMIT_PER_MINUTE", 20);
const AUTO_HIDE_REPORT_THRESHOLD = getEnvInt("AUTO_HIDE_REPORT_THRESHOLD", 5);

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestContext = getRequestContext(req, "/api/listings/[id]/report");

  try {
    const tgUser = await getAuthTelegramUser();
    if (!tgUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit({
      key: `rate:report:${tgUser.id}`,
      limit: REPORT_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
    }

    const { id: listingId } = await context.params;
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

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, status: true, title: true, reportCount: true },
    });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.sellerId === user.id) {
      return NextResponse.json({ error: "You cannot report your own listing" }, { status: 400 });
    }

    await prisma.$transaction(async (db) => {
      await db.listingReport.create({
        data: {
          listingId: listing.id,
          reporterId: user.id,
          reason: parsed.data.reason,
        },
      });

      const updated = await db.listing.update({
        where: { id: listing.id },
        data: { reportCount: { increment: 1 } },
        select: { reportCount: true, status: true },
      });

      if (
        updated.reportCount >= AUTO_HIDE_REPORT_THRESHOLD &&
        (updated.status === "ACTIVE" || updated.status === "RESERVED")
      ) {
        await db.listing.update({
          where: { id: listing.id },
          data: { status: "HIDDEN" },
        });
      }
    });

    await sendOpsAlert(
      "New listing report",
      `listing=${listing.id}\nreporter=${user.telegramId}\nreason=${parsed.data.reason}`,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "You already reported this listing" }, { status: 409 });
    }
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to submit report", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}

