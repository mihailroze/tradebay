import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEnvInt } from "@/lib/env";
import { requireAdminUser } from "@/lib/admin";
import { getRequestContext, reportServerError } from "@/lib/observability";

const DISPUTE_SLA_HOURS = getEnvInt("DISPUTE_SLA_HOURS", 24);

export async function GET(req: Request) {
  const requestContext = getRequestContext(req, "/api/admin/disputes");

  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const disputes = await prisma.listing.findMany({
      where: {
        OR: [{ status: "DISPUTED" }, { status: "RESERVED" }],
      },
      orderBy: [{ disputedAt: "desc" }, { reservedAt: "desc" }, { updatedAt: "desc" }],
      include: {
        seller: {
          select: {
            telegramId: true,
            username: true,
            displayName: true,
          },
        },
        buyer: {
          select: {
            telegramId: true,
            username: true,
            displayName: true,
          },
        },
        disputeCase: {
          include: {
            events: {
              orderBy: { createdAt: "desc" },
              take: 8,
              include: {
                actorUser: {
                  select: {
                    telegramId: true,
                    username: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        },
      },
      take: 200,
    });

    const now = Date.now();
    const disputesWithMeta = disputes.map((item) => {
      const openedAt = item.disputeCase?.openedAt ?? item.disputedAt ?? item.reservedAt;
      const openedAtMs = openedAt ? new Date(openedAt).getTime() : null;
      const slaDeadlineAt = item.disputeCase?.slaDeadlineAt
        ? new Date(item.disputeCase.slaDeadlineAt)
        : openedAtMs
          ? new Date(openedAtMs + DISPUTE_SLA_HOURS * 60 * 60 * 1000)
          : null;
      const overdue = slaDeadlineAt ? now > slaDeadlineAt.getTime() : false;
      return {
        ...item,
        slaDeadlineAt,
        overdue,
      };
    });

    return NextResponse.json({ disputes: disputesWithMeta, disputeSlaHours: DISPUTE_SLA_HOURS });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to load disputes", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}
