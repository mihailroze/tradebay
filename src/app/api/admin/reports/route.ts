import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { getRequestContext, reportServerError } from "@/lib/observability";

const patchSchema = z.object({
  reportId: z.string().cuid(),
  action: z.enum(["RESOLVE", "REJECT", "HIDE_LISTING"]),
  adminNote: z.string().trim().max(500).optional(),
});

export async function GET(req: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const reports = await prisma.listingReport.findMany({
    where:
      status === "OPEN" || status === "RESOLVED" || status === "REJECTED"
        ? { status }
        : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          seller: { select: { telegramId: true, username: true } },
        },
      },
      reporter: {
        select: {
          telegramId: true,
          username: true,
        },
      },
      resolvedBy: {
        select: {
          telegramId: true,
          username: true,
        },
      },
    },
    take: 200,
  });

  return NextResponse.json({ reports });
}

export async function PATCH(req: Request) {
  const requestContext = getRequestContext(req, "/api/admin/reports");

  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const report = await prisma.listingReport.findUnique({
      where: { id: parsed.data.reportId },
      include: { listing: { select: { id: true } } },
    });
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const now = new Date();
    if (parsed.data.action === "HIDE_LISTING") {
      await prisma.$transaction(async (db) => {
        await db.listing.update({
          where: { id: report.listingId },
          data: { status: "HIDDEN" },
        });
        await db.listingReport.update({
          where: { id: report.id },
          data: {
            status: "RESOLVED",
            adminNote: parsed.data.adminNote ?? null,
            resolvedById: admin.id,
            resolvedAt: now,
          },
        });
      });
      return NextResponse.json({ ok: true });
    }

    await prisma.listingReport.update({
      where: { id: report.id },
      data: {
        status: parsed.data.action === "RESOLVE" ? "RESOLVED" : "REJECTED",
        adminNote: parsed.data.adminNote ?? null,
        resolvedById: admin.id,
        resolvedAt: now,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to update report", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}
