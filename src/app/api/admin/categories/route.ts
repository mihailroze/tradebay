import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData, isAdminTelegramId } from "@/lib/auth";

const createSchema = z.object({
  gameId: z.string().cuid(),
  name: z.string().min(2).max(80),
  parentId: z.string().cuid().nullable().optional(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") || undefined;

  const categories = await prisma.category.findMany({
    where: gameId ? { gameId } : undefined,
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  const initData = await getTelegramInitDataFromHeaders();
  const tgUser = getTelegramUserFromInitData(initData);
  if (!tgUser || !isAdminTelegramId(tgUser.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category = await prisma.category.create({
    data: {
      gameId: parsed.data.gameId,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    },
  });

  return NextResponse.json({ category });
}
