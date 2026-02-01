import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData, isAdminTelegramId } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(2).max(80),
});

export async function GET() {
  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ games });
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

  const game = await prisma.game.create({ data: { name: parsed.data.name } });
  return NextResponse.json({ game });
}
