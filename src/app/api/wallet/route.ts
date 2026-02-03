import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";

export async function GET() {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    balance: wallet.balance,
    currency: "TC",
    transactions: transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      amount: tx.amount,
      listingId: tx.listingId,
      createdAt: tx.createdAt,
    })),
  });
}
