"use client";

import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";

type Listing = {
  id: string;
  title: string;
  description?: string | null;
  type: "SALE" | "TRADE";
  price?: string | null;
  currency?: string | null;
  tradeNote?: string | null;
  priceStars?: number | null;
  feeStars?: number | null;
  feePercent?: number | null;
  status?: "ACTIVE" | "RESERVED" | "SOLD" | "HIDDEN";
  images: { id: string }[];
  tags: { tag: { id: string; name: string } }[];
  game?: { id: string; name: string };
  server?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  seller?: { username?: string | null; lastSeenAt?: string | null };
  isFavorite?: boolean;
};

type ListingsResponse = {
  listings: Listing[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 20;

function getInitData(): string {
  if (typeof window === "undefined") return "";
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } }).Telegram;
  tg?.WebApp?.ready?.();
  const fromTelegram = tg?.WebApp?.initData || "";
  const fromUrl = readInitDataFromUrl();
  const cached = window.sessionStorage.getItem("tg_init_data") || "";
  const value = fromTelegram || fromUrl || cached;
  if (value) {
    window.sessionStorage.setItem("tg_init_data", value);
  }
  return value;
}

function readInitDataFromUrl(): string {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const raw =
      searchParams.get("tgWebAppData") ||
      searchParams.get("initData") ||
      hashParams.get("tgWebAppData") ||
      hashParams.get("initData") ||
      "";
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return "";
  }
}

function isSellerOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return false;
  return Date.now() - last < 5 * 60 * 1000;
}

function formatPrice(listing: Listing) {
  if (listing.type === "TRADE") {
    return `Обмен: ${listing.tradeNote ?? "-"}`;
  }
  const stars = listing.priceStars;
  if (stars === null || stars === undefined) {
    return "Цена: -";
  }
  return `Цена: ${stars} TC`;
}

export default function Favorites() {
  const [initData, setInitData] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const read = () => {
      const value = getInitData();
      if (value) {
        setInitData(value);
        return;
      }
      if (attempts < 10) {
        attempts += 1;
        setTimeout(read, 300);
      }
    };
    read();
  }, []);

  const loadListings = () => {
    if (!initData && !hasAuth) return;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    fetch(`/api/favorites?${params.toString()}`, {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: ListingsResponse) => {
        setListings(data.listings || []);
        setTotal(data.total || 0);
      })
      .catch(() => setListings([]));
  };

  useEffect(() => {
    const headers = initData ? { "x-telegram-init-data": initData } : undefined;
    fetch("/api/auth/me", { headers })
      .then((res) => res.json())
      .then((data: { ok?: boolean }) => setHasAuth(Boolean(data.ok)))
      .catch(() => setHasAuth(false));
  }, [initData]);

  useEffect(() => {
    loadListings();
  }, [initData, page, hasAuth]);

  const toggleFavorite = async (listingId: string, next: boolean) => {
    if (!initData && !hasAuth) {
      setStatus("Войдите через Telegram, чтобы пользоваться избранным.");
      return;
    }
    setStatus("Обновляем...");
    const res = await fetch(`/api/favorites/${listingId}`, {
      method: next ? "POST" : "DELETE",
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Ошибка: ${err.error?.message || err.error || res.statusText}`);
      return;
    }

    setStatus("Готово");
    loadListings();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10">
        <TopNav />
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Избранное</h2>
          <span className="text-xs text-neutral-400">{status}</span>
        </header>

        {!initData && !hasAuth ? (
          <p className="text-sm text-amber-400">Войдите через Telegram, чтобы видеть избранное.</p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {listings.map((listing) => (
            <article key={listing.id} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              {listing.images[0] ? (
                <img
                  src={`/api/images/${listing.images[0].id}`}
                  alt={listing.title}
                  className="mb-4 h-40 w-full rounded-2xl object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{listing.title}</h3>
                  <p className="text-sm text-neutral-400">
                    {listing.game?.name}
                    {listing.server?.name ? ` · ${listing.server.name}` : ""}
                    {listing.category?.name ? ` · ${listing.category.name}` : ""}
                  </p>
                </div>
                <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider">
                  {listing.type === "SALE" ? "Продажа" : "Обмен"}
                </span>
              </div>
              {listing.description ? <p className="mt-3 text-sm text-neutral-200">{listing.description}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-400">
                {listing.tags.map((tag) => (
                  <span key={tag.tag.id} className="rounded-full border border-neutral-800 px-3 py-1">
                    #{tag.tag.name}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-neutral-300">
                  {formatPrice(listing)}
                  {listing.feePercent ? (
                    <span className="ml-2 text-xs text-neutral-500">Комиссия {listing.feePercent}% включена</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className={`h-2 w-2 rounded-full ${isSellerOnline(listing.seller?.lastSeenAt) ? "bg-emerald-400" : "bg-neutral-600"}`} />
                    {isSellerOnline(listing.seller?.lastSeenAt) ? "Онлайн" : "Оффлайн"}
                  </span>
                  <button
                    className="rounded-full border border-neutral-700 px-3 py-1 text-xs hover:border-white"
                    onClick={() => toggleFavorite(listing.id, false)}
                  >
                    Убрать
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span>
            Страница {page} из {totalPages} · Всего {total}
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-neutral-700 px-3 py-1 hover:border-white disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Назад
            </button>
            <button
              className="rounded-full border border-neutral-700 px-3 py-1 hover:border-white disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Вперед
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
