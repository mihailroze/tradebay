import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getListingPricing } from "@/lib/pricing";
import { Prisma } from "@prisma/client";
import OpenInTelegram from "@/components/OpenInTelegram";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

function parseRubPrice(price: Prisma.Decimal): number | null {
  const raw = price.toString();
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

async function getBaseUrl() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") || hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

function buildDetail(listing: Awaited<ReturnType<typeof loadListing>>) {
  if (!listing) return "Игровой лот в TradeBay";
  if (listing.type === "SALE" && listing.currency?.toUpperCase() === "RUB" && listing.price) {
    const baseRub = parseRubPrice(listing.price);
    if (baseRub) {
      const pricing = getListingPricing(baseRub);
      return `Цена: ${pricing.totalStars} TC`;
    }
  }
  return listing.type === "SALE"
    ? `Цена: ${listing.price ?? "-"}${listing.currency ? ` ${listing.currency}` : ""}`
    : `Обмен: ${listing.tradeNote ?? "-"}`;
}

function buildDescription(listing: Awaited<ReturnType<typeof loadListing>>) {
  if (!listing) return "Игровой лот в TradeBay";
  const detail = buildDetail(listing);
  const scope = [listing.game?.name, listing.server?.name].filter(Boolean).join(" · ");
  return [detail, scope].filter(Boolean).join(" · ");
}

async function loadListing(id: string) {
  return prisma.listing.findUnique({
    where: { id, status: "ACTIVE" },
    include: {
      images: { select: { id: true } },
      tags: { include: { tag: true } },
      game: true,
      server: true,
      category: true,
      seller: { select: { username: true, lastSeenAt: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await loadListing(id);
  if (!listing) return { title: "Лот не найден · TradeBay" };
  const baseUrl = await getBaseUrl();
  const imageId = listing.images[0]?.id;
  const description = buildDescription(listing);
  return {
    title: `${listing.title} · TradeBay`,
    description,
    openGraph: {
      title: listing.title,
      description,
      type: "website",
      url: `${baseUrl}/l/${listing.id}`,
      images: imageId ? [{ url: `${baseUrl}/api/images/${imageId}` }] : undefined,
    },
    twitter: {
      card: imageId ? "summary_large_image" : "summary",
      title: listing.title,
      description,
      images: imageId ? [`${baseUrl}/api/images/${imageId}`] : undefined,
    },
  };
}

export default async function ListingSharePage({ params }: PageProps) {
  const { id } = await params;
  const listing = await loadListing(id);
  if (!listing) return notFound();

  const detail = buildDetail(listing);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">TradeBay</p>
              <h1 className="text-2xl font-semibold tracking-tight">{listing.title}</h1>
              <p className="mt-1 text-sm text-neutral-400">
                {listing.game?.name}
                {listing.server?.name ? ` · ${listing.server.name}` : ""}
                {listing.category?.name ? ` · ${listing.category.name}` : ""}
              </p>
            </div>
            <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider">
              {listing.type === "SALE" ? "Продажа" : "Обмен"}
            </span>
          </div>

          {listing.images[0] ? (
            <img
              src={`/api/images/${listing.images[0].id}`}
              alt={listing.title}
              className="mt-4 h-56 w-full rounded-2xl object-cover"
            />
          ) : null}

          <p className="mt-4 text-sm text-neutral-200">{detail}</p>
          {listing.description ? <p className="mt-3 text-sm text-neutral-300">{listing.description}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-400">
            {listing.tags.map((tag) => (
              <span key={tag.tag.id} className="rounded-full border border-neutral-800 px-3 py-1">
                #{tag.tag.name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OpenInTelegram listingId={listing.id} />
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-300 hover:border-white"
          >
            Открыть сайт
          </a>
        </div>
      </div>
    </div>
  );
}
