import { headers } from "next/headers";
import { verifyTelegramInitData, TelegramWebAppUser } from "@/lib/telegram";
import { normalizeEnvValue } from "@/lib/env";
import { getSessionFromCookies } from "@/lib/session";

const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export async function getTelegramInitDataFromHeaders() {
  const hdrs = await headers();
  return hdrs.get("x-telegram-init-data")?.trim() ?? "";
}

export function getTelegramUserFromInitData(initData: string): TelegramWebAppUser | null {
  const botToken = normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  const verified = verifyTelegramInitData(initData.trim(), botToken);
  return verified?.user ?? null;
}

export type AuthTelegramUser = TelegramWebAppUser & { source: "webapp" | "session" };

export async function getAuthTelegramUser(): Promise<AuthTelegramUser | null> {
  const initData = await getTelegramInitDataFromHeaders();
  const webAppUser = initData ? getTelegramUserFromInitData(initData) : null;
  if (webAppUser) {
    return { ...webAppUser, source: "webapp" };
  }

  const session = await getSessionFromCookies();
  if (!session) return null;
  const id = Number(session.telegramId);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    username: session.username ?? undefined,
    first_name: session.firstName ?? undefined,
    last_name: session.lastName ?? undefined,
    source: "session",
  };
}

export function isAdminTelegramId(telegramId?: number | string | null): boolean {
  if (!telegramId) return false;
  return ADMIN_IDS.includes(String(telegramId));
}
