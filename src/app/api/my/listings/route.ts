import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData } from "@/lib/auth";

export async function GET() {
  const initData = await getTelegramInitDataFromHeaders();
  const tgUser = getTelegramUserFromInitData(initData);
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const listings = await prisma.listing.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      images: { select: { id: true } },
      tags: { include: { tag: true } },
      game: true,
      server: true,
      category: true,
    },
  });

  return NextResponse.json({ listings });
}
