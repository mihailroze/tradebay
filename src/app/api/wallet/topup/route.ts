import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { normalizeEnvValue } from "@/lib/env";

const MAX_TOPUP = 10000;

async function createInvoiceLink(payload: {
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
}) {
  const botToken = normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken) {
    throw new Error("missing_bot_token");
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      payload: payload.payload,
      provider_token: "",
      currency: payload.currency,
      prices: payload.prices,
    }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: string; description?: string } | null;
  if (!data?.ok || !data.result) {
    throw new Error(data?.description || "telegram_error");
  }
  return data.result;
}

export async function POST(req: Request) {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const amountRaw = body?.amount;
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ error: "Amount must be a whole number" }, { status: 400 });
  }
  if (amount > MAX_TOPUP) {
    return NextResponse.json({ error: `Max top-up is ${MAX_TOPUP}` }, { status: 400 });
  }

  const user = await prisma.user.upsert({
    where: { telegramId: String(tgUser.id) },
    update: {
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
    create: {
      telegramId: String(tgUser.id),
      username: tgUser.username ?? null,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || null,
      lastSeenAt: new Date(),
    },
  });

  const wallet = await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const tx = await prisma.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "TOP_UP",
      status: "PENDING",
      amount,
      currency: "TC",
      payload: `tb_topup:${crypto.randomUUID()}`,
    },
  });

  const invoiceUrl = await createInvoiceLink({
    title: "Trade Coin",
    description: `Top up Trade Coin balance (+${amount} TC)`,
    payload: tx.payload || `tb_topup:${tx.id}`,
    currency: "XTR",
    prices: [{ label: "Trade Coin", amount }],
  });

  return NextResponse.json({ ok: true, url: invoiceUrl, transactionId: tx.id });
}
