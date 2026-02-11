import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEnvValue } from "@/lib/env";
import { callTelegramApi } from "@/lib/telegram-bot";
import { getRequestContext, logInfo, logWarn, reportServerError } from "@/lib/observability";
import { sendOpsAlert } from "@/lib/alerts";

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

async function answerPreCheckout(queryId: string, ok: boolean, errorMessage?: string) {
  await callTelegramApi("answerPreCheckoutQuery", {
    pre_checkout_query_id: queryId,
    ok,
    error_message: ok ? undefined : errorMessage || "Invalid payment",
  });
}

export async function POST(req: Request) {
  const context = getRequestContext(req, "/api/telegram/webhook");

  try {
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
        where: {
          payload: query.invoice_payload,
          type: "TOP_UP",
        },
      });

      const isValid =
        Boolean(tx) &&
        query.currency === "XTR" &&
        Number.isInteger(query.total_amount) &&
        query.total_amount > 0 &&
        tx?.status === "PENDING" &&
        tx?.amount === query.total_amount;

      await answerPreCheckout(query.id, isValid, isValid ? undefined : "Invalid payment");
      return NextResponse.json({ ok: true });
    }

    if (update.message?.successful_payment) {
      const payment = update.message.successful_payment;
      if (payment.currency !== "XTR") {
        return NextResponse.json({ ok: true });
      }

      const tx = await prisma.walletTransaction.findFirst({
        where: {
          payload: payment.invoice_payload,
          type: "TOP_UP",
        },
      });
      if (!tx) {
        await sendOpsAlert(
          "Webhook payment mismatch",
          `Unknown invoice payload: ${payment.invoice_payload}`,
        );
        return NextResponse.json({ ok: true });
      }

      if (tx.providerRef === payment.telegram_payment_charge_id || tx.status === "COMPLETED") {
        return NextResponse.json({ ok: true });
      }

      if (tx.providerRef && tx.providerRef !== payment.telegram_payment_charge_id) {
        await sendOpsAlert(
          "Webhook duplicate providerRef",
          `tx=${tx.id}\nexistingRef=${tx.providerRef}\nnewRef=${payment.telegram_payment_charge_id}`,
        );
        return NextResponse.json({ ok: true });
      }

      if (tx.amount !== payment.total_amount) {
        await sendOpsAlert(
          "Webhook amount mismatch",
          `tx=${tx.id}\nexpected=${tx.amount}\nactual=${payment.total_amount}`,
        );
        return NextResponse.json({ ok: true });
      }

      try {
        await prisma.$transaction(async (db) => {
          const updated = await db.walletTransaction.update({
            where: { id: tx.id },
            data: {
              status: "COMPLETED",
              providerRef: payment.telegram_payment_charge_id,
            },
          });
          await db.wallet.update({
            where: { id: updated.walletId },
            data: { balance: { increment: updated.amount } },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2025" || error.code === "P2002")
        ) {
          logWarn("Webhook idempotency conflict", context, {
            transactionId: tx.id,
            providerRef: payment.telegram_payment_charge_id,
          });
          return NextResponse.json({ ok: true });
        }
        throw error;
      }

      logInfo("Top-up payment confirmed", context, {
        transactionId: tx.id,
        providerRef: payment.telegram_payment_charge_id,
        amount: tx.amount,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await reportServerError(error, context);
    return NextResponse.json({ ok: true });
  }
}

