import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthTelegramUser } from "@/lib/auth";
import { getListingPricing } from "@/lib/pricing";
import { Prisma } from "@prisma/client";

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function GET(req: Request) {
  const tgUser = await getAuthTelegramUser();
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

  const listings = favorites.map((fav) => {
    let pricing: ReturnType<typeof getListingPricing> | null = null;
    if (fav.listing.type === "SALE" && fav.listing.currency?.toUpperCase() === "RUB" && fav.listing.price) {
      const baseRub = parseRubPrice(fav.listing.price);
      if (baseRub) {
        pricing = getListingPricing(baseRub);
      }
    }
    return {
      ...fav.listing,
      isFavorite: true,
      priceStars: pricing?.totalStars ?? null,
      feeStars: pricing?.feeStars ?? null,
      feePercent: pricing?.feePercent ?? null,
    };
  });

  return NextResponse.json({ listings, total, page, pageSize });
}
