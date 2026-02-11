import { normalizeEnvValue } from "@/lib/env";
import { sendTelegramMessage } from "@/lib/telegram-bot";

function getAlertTelegramTargets() {
  const explicitChat = normalizeEnvValue(process.env.TELEGRAM_ALERT_CHAT_ID);
  if (explicitChat) return [explicitChat];
  return (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function sendEmailAlert(subject: string, message: string) {
  const webhookUrl = normalizeEnvValue(process.env.ALERT_EMAIL_WEBHOOK_URL);
  if (!webhookUrl) return false;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, message }),
  }).catch(() => null);
  return Boolean(response?.ok);
}

export async function sendOpsAlert(subject: string, details: string) {
  const text = `TradeBay alert: ${subject}\n${details}`.slice(0, 3800);
  const targets = getAlertTelegramTargets();
  const telegramResults = await Promise.allSettled(targets.map((chatId) => sendTelegramMessage(chatId, text)));
  const telegramSent = telegramResults.some(
    (item) => item.status === "fulfilled" && item.value,
  );
  const emailSent = await sendEmailAlert(subject, details);
  return { telegramSent, emailSent };
}

