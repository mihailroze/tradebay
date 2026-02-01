import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData } from "@/lib/auth";

export async function POST() {
  const initData = getTelegramInitDataFromHeaders();
  const tgUser = getTelegramUserFromInitData(initData);

  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { telegramId: String(tgUser.id) },
    update: {
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
    },
    create: {
      telegramId: String(tgUser.id),
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
    },
  });

  return NextResponse.json({ user });
}
