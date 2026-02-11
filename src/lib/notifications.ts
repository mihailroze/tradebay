import { sendTelegramMessage } from "@/lib/telegram-bot";

type DealNotificationPayload = {
  listingId: string;
  listingTitle: string;
  buyerTelegramId?: string | null;
  sellerTelegramId?: string | null;
  amountTc?: number | null;
  feeTc?: number | null;
};

function listingLink(listingId: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/^['"]|['"]$/g, "");
  if (!base) return "";
  return `${base}/l/${listingId}`;
}

export async function notifyDealReserved(payload: DealNotificationPayload) {
  const link = listingLink(payload.listingId);
  const buyerText = [
    "TradeBay: сделка создана.",
    `Лот: ${payload.listingTitle}`,
    payload.amountTc ? `Заморожено: ${payload.amountTc} TC` : "",
    link ? `Ссылка: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const sellerText = [
    "TradeBay: у вашего лота появился покупатель.",
    `Лот: ${payload.listingTitle}`,
    payload.amountTc ? `Сумма сделки: ${payload.amountTc} TC` : "",
    link ? `Ссылка: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.allSettled([
    payload.buyerTelegramId ? sendTelegramMessage(payload.buyerTelegramId, buyerText) : Promise.resolve(false),
    payload.sellerTelegramId ? sendTelegramMessage(payload.sellerTelegramId, sellerText) : Promise.resolve(false),
  ]);
}

export async function notifyDealSold(payload: DealNotificationPayload) {
  const link = listingLink(payload.listingId);
  const buyerText = [
    "TradeBay: сделка подтверждена.",
    `Лот: ${payload.listingTitle}`,
    link ? `Ссылка: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const sellerText = [
    "TradeBay: средства переведены продавцу.",
    `Лот: ${payload.listingTitle}`,
    payload.amountTc ? `Получено: ${payload.amountTc} TC` : "",
    payload.feeTc ? `Комиссия платформы: ${payload.feeTc} TC` : "",
    link ? `Ссылка: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.allSettled([
    payload.buyerTelegramId ? sendTelegramMessage(payload.buyerTelegramId, buyerText) : Promise.resolve(false),
    payload.sellerTelegramId ? sendTelegramMessage(payload.sellerTelegramId, sellerText) : Promise.resolve(false),
  ]);
}

export async function notifyDealRefund(payload: DealNotificationPayload, reason: string) {
  const link = listingLink(payload.listingId);
  const buyerText = [
    "TradeBay: сделка отменена, средства возвращены.",
    `Лот: ${payload.listingTitle}`,
    payload.amountTc ? `Возврат: ${payload.amountTc} TC` : "",
    `Причина: ${reason}`,
    link ? `Ссылка: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const sellerText = [
    "TradeBay: сделка отменена.",
    `Лот: ${payload.listingTitle}`,
    `Причина: ${reason}`,
    link ? `Ссылка: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.allSettled([
    payload.buyerTelegramId ? sendTelegramMessage(payload.buyerTelegramId, buyerText) : Promise.resolve(false),
    payload.sellerTelegramId ? sendTelegramMessage(payload.sellerTelegramId, sellerText) : Promise.resolve(false),
  ]);
}

export async function notifyDisputeOpened(payload: {
  listingId: string;
  listingTitle: string;
  buyerTelegramId?: string | null;
  sellerTelegramId?: string | null;
  reason: string;
  slaHours: number;
}) {
  const link = listingLink(payload.listingId);
  const buyerText = [
    "TradeBay: dispute opened.",
    `Listing: ${payload.listingTitle}`,
    `Reason: ${payload.reason}`,
    `SLA: up to ${payload.slaHours}h`,
    link ? `Link: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const sellerText = [
    "TradeBay: dispute opened by counterparty.",
    `Listing: ${payload.listingTitle}`,
    `Reason: ${payload.reason}`,
    `SLA: up to ${payload.slaHours}h`,
    link ? `Link: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.allSettled([
    payload.buyerTelegramId ? sendTelegramMessage(payload.buyerTelegramId, buyerText) : Promise.resolve(false),
    payload.sellerTelegramId ? sendTelegramMessage(payload.sellerTelegramId, sellerText) : Promise.resolve(false),
  ]);
}

export async function notifyDisputeReview(payload: {
  listingId: string;
  listingTitle: string;
  buyerTelegramId?: string | null;
  sellerTelegramId?: string | null;
  note?: string | null;
}) {
  const link = listingLink(payload.listingId);
  const text = [
    "TradeBay: dispute moved to in-review.",
    `Listing: ${payload.listingTitle}`,
    payload.note ? `Admin note: ${payload.note}` : "",
    link ? `Link: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  await Promise.allSettled([
    payload.buyerTelegramId ? sendTelegramMessage(payload.buyerTelegramId, text) : Promise.resolve(false),
    payload.sellerTelegramId ? sendTelegramMessage(payload.sellerTelegramId, text) : Promise.resolve(false),
  ]);
}
