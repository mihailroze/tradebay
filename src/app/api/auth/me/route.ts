import { NextResponse } from "next/server";
import { getTelegramInitDataFromHeaders, isAdminTelegramId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTelegramInitData } from "@/lib/telegram";
import { getSessionFromCookies } from "@/lib/session";
import { normalizeEnvValue } from "@/lib/env";

export async function GET() {
  const initData = await getTelegramInitDataFromHeaders();
  const botToken = normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "missing_bot_token" }, { status: 500 });
  }

  const verified = initData ? verifyTelegramInitData(initData, botToken) : null;
  if (verified?.user) {
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
      source: "webapp",
      user: {
        id: verified.user.id,
        username: verified.user.username ?? null,
        firstName: verified.user.first_name ?? null,
        lastName: verified.user.last_name ?? null,
      },
      isAdmin: isAdminTelegramId(verified.user.id),
    });
  }

  const session = await getSessionFromCookies();
  if (session?.telegramId) {
    return NextResponse.json({
      ok: true,
      source: "session",
      user: {
        id: Number(session.telegramId),
        username: session.username ?? null,
        firstName: session.firstName ?? null,
        lastName: session.lastName ?? null,
      },
      isAdmin: isAdminTelegramId(session.telegramId),
    });
  }

  if (!initData) {
    return NextResponse.json({ ok: false, error: "missing_auth" }, { status: 401 });
  }

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
