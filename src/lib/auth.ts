import { headers } from "next/headers";
import { verifyTelegramInitData, TelegramWebAppUser } from "@/lib/telegram";

const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export async function getTelegramInitDataFromHeaders() {
  const hdrs = await headers();
  return hdrs.get("x-telegram-init-data")?.trim() ?? "";
}

export function getTelegramUserFromInitData(initData: string): TelegramWebAppUser | null {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const verified = verifyTelegramInitData(initData.trim(), botToken);
  return verified?.user ?? null;
}

export function isAdminTelegramId(telegramId?: number | string | null): boolean {
  if (!telegramId) return false;
  return ADMIN_IDS.includes(String(telegramId));
}
