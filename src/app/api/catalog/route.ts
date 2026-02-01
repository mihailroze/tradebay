import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const games = await prisma.game.findMany({
    orderBy: { name: "asc" },
    include: {
      servers: { orderBy: { name: "asc" } },
      categories: { orderBy: { name: "asc" } },
      tags: { orderBy: { name: "asc" } },
    },
  });

  return NextResponse.json({ games });
}
