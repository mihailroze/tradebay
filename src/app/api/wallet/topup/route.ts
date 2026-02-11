import crypto from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { callTelegramApi } from "@/lib/telegram-bot";
import { getEnvInt } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { getRequestContext, logInfo, reportServerError } from "@/lib/observability";

const MAX_TOPUP = getEnvInt("TOPUP_MAX_TC", 10000);
const TOPUP_DAILY_LIMIT_TC = getEnvInt("TOPUP_DAILY_LIMIT_TC", 50000);
const TOPUP_DAILY_OPS_LIMIT = getEnvInt("TOPUP_DAILY_OPS_LIMIT", 30);
const TOPUP_RATE_LIMIT_PER_MINUTE = getEnvInt("TOPUP_RATE_LIMIT_PER_MINUTE", 8);

function parseIdempotencyKey(req: Request, body: unknown) {
  const fromHeader = req.headers.get("idempotency-key")?.trim() || "";
  const fromBody =
    body && typeof body === "object" && "idempotencyKey" in body
      ? String((body as { idempotencyKey?: unknown }).idempotencyKey || "").trim()
      : "";
  const key = fromHeader || fromBody;
  if (!key) return "";
  if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(key)) return "";
  return key;
}

async function createInvoiceLink(payload: {
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
}) {
  const response = await callTelegramApi("createInvoiceLink", {
    title: payload.title,
    description: payload.description,
    payload: payload.payload,
    provider_token: "",
    currency: payload.currency,
    prices: payload.prices,
  });
  if (!response?.ok || typeof response.result !== "string") {
    throw new Error(response?.description || "telegram_invoice_error");
  }
  return response.result;
}

function getUtcDayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function POST(req: Request) {
  const context = getRequestContext(req, "/api/wallet/topup");

  try {
    const tgUser = await getAuthTelegramUser();
    if (!tgUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rate = checkRateLimit({
      key: `rate:topup:${tgUser.id}`,
      limit: TOPUP_RATE_LIMIT_PER_MINUTE,
      windowMs: 60_000,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => null);
    const amount = Number((body as { amount?: unknown } | null)?.amount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
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

    const todayStart = getUtcDayStart();
    const todayAggregate = await prisma.walletTransaction.aggregate({
      where: {
        walletId: wallet.id,
        type: "TOP_UP",
        createdAt: { gte: todayStart },
        amount: { gt: 0 },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const todayAmount = Number(todayAggregate._sum.amount || 0);
    const todayCount = Number(todayAggregate._count._all || 0);
    if (todayCount + 1 > TOPUP_DAILY_OPS_LIMIT) {
      return NextResponse.json({ error: "Daily top-up operations limit exceeded" }, { status: 400 });
    }
    if (todayAmount + amount > TOPUP_DAILY_LIMIT_TC) {
      return NextResponse.json({ error: "Daily top-up amount limit exceeded" }, { status: 400 });
    }

    const rawKey = parseIdempotencyKey(req, body);
    const idempotencyKey = rawKey || crypto.randomUUID();
    const txExternalId = `topup:${wallet.id}:${idempotencyKey}`;

    const existingTx = await prisma.walletTransaction.findUnique({
      where: { externalId: txExternalId },
    });
    const tx =
      existingTx ||
      (await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "TOP_UP",
          status: "PENDING",
          amount,
          currency: "TC",
          payload: `tb_topup:${crypto.randomUUID()}`,
          externalId: txExternalId,
          idempotencyKey,
        },
      }).catch(async (error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const conflictTx = await prisma.walletTransaction.findUnique({
            where: { externalId: txExternalId },
          });
          if (conflictTx) return conflictTx;
        }
        throw error;
      }));

    if (!tx) {
      return NextResponse.json({ error: "Unable to create top-up transaction" }, { status: 500 });
    }
    if (tx.status === "COMPLETED") {
      return NextResponse.json({
        ok: true,
        status: "completed",
        transactionId: tx.id,
        balanceChanged: true,
      });
    }
    if (tx.amount !== amount) {
      return NextResponse.json(
        { error: "Idempotency key reused with different amount" },
        { status: 409 },
      );
    }

    const invoiceUrl = await createInvoiceLink({
      title: "Trade Coin",
      description: `Top up Trade Coin balance (+${amount} TC)`,
      payload: tx.payload || `tb_topup:${tx.id}`,
      currency: "XTR",
      prices: [{ label: "Trade Coin", amount }],
    });

    logInfo("Top-up invoice created", context, {
      telegramId: String(tgUser.id),
      walletId: wallet.id,
      transactionId: tx.id,
      amount,
      idempotencyKey,
    });

    return NextResponse.json({
      ok: true,
      url: invoiceUrl,
      transactionId: tx.id,
      idempotencyKey,
    });
  } catch (error) {
    await reportServerError(error, context);
    const message = error instanceof Error ? error.message : "Top-up failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

