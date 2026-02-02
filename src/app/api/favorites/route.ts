import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTelegramInitDataFromHeaders, getTelegramUserFromInitData } from "@/lib/auth";

export async function GET(req: Request) {
  const initData = await getTelegramInitDataFromHeaders();
  const tgUser = getTelegramUserFromInitData(initData);
  if (!tgUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pageRaw = Number(searchParams.get("page"));
  const pageSizeRaw = Number(searchParams.get("pageSize"));
  const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(50, Math.max(10, pageSizeRaw)) : 20;

  const user = await prisma.user.findUnique({
    where: { telegramId: String(tgUser.id) },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ listings: [], total: 0, page, pageSize });
  }

  const [total, favorites] = await prisma.$transaction([
    prisma.listingFavorite.count({ where: { userId: user.id } }),
    prisma.listingFavorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        listing: {
          include: {
            images: { select: { id: true } },
            tags: { include: { tag: true } },
            game: true,
            server: true,
            category: true,
            seller: { select: { username: true, lastSeenAt: true } },
          },
        },
      },
    }),
  ]);

  const listings = favorites.map((fav) => ({
    ...fav.listing,
    isFavorite: true,
  }));

  return NextResponse.json({ listings, total, page, pageSize });
}
