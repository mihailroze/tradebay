import { normalizeEnvValue } from "@/lib/env";

type TelegramSendMessageResponse = {
  ok?: boolean;
  result?: unknown;
  description?: string;
};

function getBotToken() {
  return normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
}

function canUseTelegramId(chatId: string) {
  return /^-?\d+$/.test(chatId);
}

export async function callTelegramApi<T extends Record<string, unknown>>(
  method: string,
  payload: T,
): Promise<TelegramSendMessageResponse | null> {
  const botToken = getBotToken();
  if (!botToken) return null;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => null);

  if (!response) return null;
  return (await response.json().catch(() => null)) as TelegramSendMessageResponse | null;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  if (!canUseTelegramId(chatId)) return false;
  const payload = {
    chat_id: Number(chatId),
    text,
    disable_web_page_preview: true,
  };
  const response = await callTelegramApi("sendMessage", payload);
  return Boolean(response?.ok);
}

