import { NextResponse } from "next/server";
import { getTelegramInitDataFromHeaders, isAdminTelegramId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTelegramInitData } from "@/lib/telegram";

export async function GET() {
  const initData = await getTelegramInitDataFromHeaders();
  if (!initData) {
    return NextResponse.json({ ok: false, error: "missing_init_data" }, { status: 401 });
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "missing_bot_token" }, { status: 500 });
  }

  const verified = verifyTelegramInitData(initData, botToken);
  if (!verified?.user) {
    const params = new URLSearchParams(initData);
    const hasHash = Boolean(params.get("hash"));
    const hasSignature = Boolean(params.get("signature"));
    const botId = botToken.split(":")[0] || "";
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_hash",
        debug: {
          initDataLength: initData.length,
          hasHash,
          hasSignature,
          botId,
          tokenLength: botToken.length,
        },
      },
      { status: 401 },
    );
  }

  await prisma.user.upsert({
    where: { telegramId: String(verified.user.id) },
    update: {
      username: verified.user.username ?? null,
      displayName: [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
    create: {
      telegramId: String(verified.user.id),
      username: verified.user.username ?? null,
      displayName: [verified.user.first_name, verified.user.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: verified.user.id,
      username: verified.user.username ?? null,
      firstName: verified.user.first_name ?? null,
      lastName: verified.user.last_name ?? null,
    },
    isAdmin: isAdminTelegramId(verified.user.id),
  });
}
