import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTelegramLoginData } from "@/lib/telegram";
import { createSessionCookie } from "@/lib/session";
import { getEnvInt, normalizeEnvValue } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestContext, reportServerError } from "@/lib/observability";

async function handleLogin(payload: Record<string, unknown>) {
  const botToken = normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
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

function getAllowedOrigin(requestOrigin: string) {
  const envBase = normalizeEnvValue(process.env.NEXT_PUBLIC_SITE_URL);
  if (!envBase) return requestOrigin;
  try {
    return new URL(envBase).origin;
  } catch {
    return requestOrigin;
  }
}

function safeReturnTo(raw: string | null, requestOrigin: string) {
  const allowedOrigin = getAllowedOrigin(requestOrigin);
  if (!raw) return allowedOrigin;
  try {
    const url = new URL(raw, allowedOrigin);
    if (url.origin !== allowedOrigin) return allowedOrigin;
    return url.toString();
  } catch {
    return allowedOrigin;
  }
}

const AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = getEnvInt("AUTH_LOGIN_RATE_LIMIT_PER_MINUTE", 60);

function getClientKey(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function GET(req: Request) {
  const requestContext = getRequestContext(req, "/api/auth/telegram-login");

  try {
    const rate = checkRateLimit({
      key: `rate:auth:login:get:${getClientKey(req)}`,
      limit: AUTH_LOGIN_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
    }

    const url = new URL(req.url);
    const allowedKeys = new Set(["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]);
    const payload = Object.fromEntries(
      Array.from(url.searchParams.entries()).filter(([key]) => allowedKeys.has(key)),
    );
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
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const requestContext = getRequestContext(req, "/api/auth/telegram-login");

  try {
    const rate = checkRateLimit({
      key: `rate:auth:login:post:${getClientKey(req)}`,
      limit: AUTH_LOGIN_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const allowedKeys = new Set(["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]);
    const sanitized = Object.fromEntries(
      Object.entries(payload as Record<string, unknown>).filter(([key]) => allowedKeys.has(key)),
    );
    const result = await handleLogin(sanitized);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }

    const res = NextResponse.json({ ok: true, user: result.user });
    if (result.cookie) {
      res.headers.set("Set-Cookie", result.cookie);
    }
    return res;
  } catch (error) {
    await reportServerError(error, requestContext);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
