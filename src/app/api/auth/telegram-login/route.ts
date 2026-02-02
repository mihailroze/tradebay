import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTelegramLoginData } from "@/lib/telegram";
import { createSessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "missing_bot_token" }, { status: 500 });
  }

  const verified = verifyTelegramLoginData(payload as Record<string, unknown>, botToken);
  if (!verified) {
    return NextResponse.json({ ok: false, error: "invalid_hash" }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { telegramId: String(verified.id) },
    update: {
      username: verified.username ?? null,
      displayName: [verified.first_name, verified.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
    create: {
      telegramId: String(verified.id),
      username: verified.username ?? null,
      displayName: [verified.first_name, verified.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
  });

  const cookie = createSessionCookie({
    telegramId: user.telegramId,
    username: user.username,
    firstName: verified.first_name ?? null,
    lastName: verified.last_name ?? null,
  });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.telegramId,
      username: user.username,
    },
  });
  res.headers.set("Set-Cookie", cookie);
  return res;
}
