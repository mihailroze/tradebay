import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { telegramId: String(tgUser.id) },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.listingFavorite.upsert({
    where: {
      userId_listingId: {
        userId: user.id,
        listingId: id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      listingId: id,
    },
  });

  return NextResponse.json({ ok: true, favorited: true });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { telegramId: String(tgUser.id) },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.listingFavorite.deleteMany({
    where: {
      userId: user.id,
      listingId: id,
    },
  });

  return NextResponse.json({ ok: true, favorited: false });
}
