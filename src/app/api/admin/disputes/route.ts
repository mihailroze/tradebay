import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser, isAdminTelegramId } from "@/lib/auth";
import { getRequestContext, reportServerError } from "@/lib/observability";

async function ensureAdminUser() {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser || !isAdminTelegramId(tgUser.id)) return null;

  return prisma.user.upsert({
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
    select: { id: true },
  });
}

export async function GET(req: Request) {
  const requestContext = getRequestContext(req, "/api/admin/disputes");

  try {
    const admin = await ensureAdminUser();
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
      },
      take: 200,
    });

    return NextResponse.json({ disputes });
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json(
      { error: "Failed to load disputes", requestId: requestContext.requestId },
      { status: 500 },
    );
  }
}
