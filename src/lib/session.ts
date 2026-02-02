import crypto from "crypto";
import { cookies } from "next/headers";
import { normalizeEnvValue } from "@/lib/env";

const SESSION_COOKIE = "tb_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type SessionPayload = {
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  exp?: number;
};

function getSessionSecret(): string {
  const secret =
    normalizeEnvValue(process.env.SESSION_SECRET) || normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return secret;
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createSessionCookie(payload: SessionPayload): string {
  const secret = getSessionSecret();
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const body = JSON.stringify({ ...payload, exp });
  const encoded = Buffer.from(body).toString("base64url");
  const token = `${encoded}.${sign(encoded, secret)}`;
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE};${secure}`;
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  let token = "";
  try {
    const store = await cookies();
    token = store.get(SESSION_COOKIE)?.value ?? "";
  } catch {
    return null;
  }
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  let data: SessionPayload | null = null;
  try {
    const secret = getSessionSecret();
    const expected = sign(encoded, secret);
    if (!timingSafeEqual(signature, expected)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    if (!parsed?.telegramId) return null;
    if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) return null;
    data = parsed;
  } catch {
    return null;
  }
  return data;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secure}`;
}
