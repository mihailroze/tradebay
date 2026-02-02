import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser, isAdminTelegramId } from "@/lib/auth";

const createSchema = z.object({
  gameId: z.string().cuid(),
  name: z.string().min(2).max(80),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") || undefined;

  const servers = await prisma.server.findMany({
    where: gameId ? { gameId } : undefined,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ servers });
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

  const server = await prisma.server.create({ data: parsed.data });
  return NextResponse.json({ server });
}
