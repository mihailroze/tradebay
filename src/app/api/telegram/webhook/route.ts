import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEnvValue } from "@/lib/env";

type PreCheckoutQuery = {
  id: string;
  invoice_payload: string;
  currency: string;
  total_amount: number;
};

type SuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
};

type Update = {
  pre_checkout_query?: PreCheckoutQuery;
  message?: {
    successful_payment?: SuccessfulPayment;
  };
};

async function callTelegram(method: string, payload: Record<string, unknown>) {
  const botToken = normalizeEnvValue(process.env.TELEGRAM_BOT_TOKEN);
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function POST(req: Request) {
  const secret = normalizeEnvValue(process.env.TELEGRAM_WEBHOOK_SECRET);
  const header = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (secret && header !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update) {
    return NextResponse.json({ ok: true });
  }

  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    const tx = await prisma.walletTransaction.findFirst({
      where: { payload: query.invoice_payload },
    });
    const isValid =
      Boolean(tx) &&
      query.currency === "XTR" &&
      Number.isInteger(query.total_amount) &&
      query.total_amount > 0 &&
      tx?.status === "PENDING" &&
      tx?.amount === query.total_amount;

    await callTelegram("answerPreCheckoutQuery", {
      pre_checkout_query_id: query.id,
      ok: isValid,
      error_message: isValid ? undefined : "Invalid payment",
    });
  }

  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment;
    if (payment.currency === "XTR") {
      const tx = await prisma.walletTransaction.findFirst({
        where: { payload: payment.invoice_payload },
      });
      if (tx && tx.status !== "COMPLETED") {
        await prisma.$transaction(async (db) => {
          const updated = await db.walletTransaction.update({
            where: { id: tx.id },
            data: {
              status: "COMPLETED",
              externalId: payment.telegram_payment_charge_id,
            },
          });
          await db.wallet.update({
            where: { id: updated.walletId },
            data: { balance: { increment: updated.amount } },
          });
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
