import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser, isAdminTelegramId } from "@/lib/auth";

const createSchema = z.object({
  gameId: z.string().cuid(),
  name: z.string().min(1).max(40),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") || undefined;

  const tags = await prisma.tag.findMany({
    where: gameId ? { gameId } : undefined,
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({ tags });
}

export async function POST(req: Request) {
  const tgUser = await getAuthTelegramUser();
  if (!tgUser || !isAdminTelegramId(tgUser.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tag = await prisma.tag.create({ data: parsed.data });
  return NextResponse.json({ tag });
}
