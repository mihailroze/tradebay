import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTelegramLoginData } from "@/lib/telegram";
import { createSessionCookie } from "@/lib/session";

async function handleLogin(payload: Record<string, unknown>) {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    return { ok: false, error: "missing_bot_token", status: 500 };
  }

  const verified = verifyTelegramLoginData(payload, botToken);
  if (!verified) {
    return { ok: false, error: "invalid_hash", status: 401 };
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

  return {
    ok: true,
    status: 200,
    cookie,
    user: {
      id: user.telegramId,
      username: user.username,
    },
  };
}

function safeReturnTo(raw: string | null, origin: string) {
  if (!raw) return origin;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return origin;
    return url.toString();
  } catch {
    return origin;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const payload = Object.fromEntries(url.searchParams.entries());
  if (!payload || !payload.hash) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const result = await handleLogin(payload);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"), url.origin);
  if (!result.ok) {
    return NextResponse.redirect(`${returnTo}?login_error=${encodeURIComponent(result.error || "auth_failed")}`, 302);
  }

  const res = NextResponse.redirect(returnTo, 302);
  if (result.cookie) {
    res.headers.set("Set-Cookie", result.cookie);
  }
  return res;
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const result = await handleLogin(payload as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const res = NextResponse.json({ ok: true, user: result.user });
  if (result.cookie) {
    res.headers.set("Set-Cookie", result.cookie);
  }
  return res;
}
