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
  status: "ACTIVE" | "SOLD" | "HIDDEN";
  images: { id: string }[];
  tags: { tag: { id: string; name: string } }[];
  game?: { id: string; name: string };
  server?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
};

type ListingsResponse = { listings: Listing[] };

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

function buildShareUrl(listingId: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(`/l/${listingId}`, window.location.origin);
  return url.toString();
}

function buildShareText(listing: Listing): string {
  const detail =
    listing.type === "SALE"
      ? `Цена: ${listing.price ?? "-"}${listing.currency ? ` ${listing.currency}` : ""}`
      : `Обмен: ${listing.tradeNote ?? "-"}`;
  const raw = `${listing.title} · ${detail}`.trim();
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

export default function MyListings() {
  const [initData, setInitData] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState("");
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
    fetch("/api/my/listings", {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: ListingsResponse) => setListings(data.listings))
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
  }, [initData, hasAuth]);

  const updateStatus = async (id: string, nextStatus: Listing["status"]) => {
    if (!initData && !hasAuth) {
      setStatus("Войдите через Telegram, чтобы управлять лотами.");
      return;
    }
    setStatus("Обновляем...");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (initData) headers["x-telegram-init-data"] = initData;
    const res = await fetch(`/api/listings/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: nextStatus }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Ошибка: ${err.error?.message || err.error || res.statusText}`);
      return;
    }

    setStatus("Готово");
    loadListings();
  };

  const shareListing = (listing: Listing) => {
    const shareUrl = buildShareUrl(listing.id);
    const shareText = buildShareText(listing);
    const shareLink = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}${
      shareText ? `&text=${encodeURIComponent(shareText)}` : ""
    }`;
    const tg = (window as unknown as { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } } })
      .Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareLink);
    } else if (typeof window !== "undefined") {
      window.open(shareLink, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10">
        <TopNav />
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Мои лоты</h2>
          <span className="text-xs text-neutral-400">{status}</span>
        </header>

        {!initData && !hasAuth ? (
          <p className="text-sm text-amber-400">Войдите через Telegram, чтобы управлять лотами.</p>
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
                  {listing.status}
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
                  {listing.type === "SALE"
                    ? `Цена: ${listing.price ?? "-"} ${listing.currency ?? ""}`
                    : `Обмен: ${listing.tradeNote ?? "-"}`}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-white"
                    onClick={() => shareListing(listing)}
                  >
                    Поделиться
                  </button>
                  <button
                    className="rounded-full border border-neutral-700 px-3 py-1 text-xs hover:border-white"
                    onClick={() => updateStatus(listing.id, "ACTIVE")}
                  >
                    Активен
                  </button>
                  <button
                    className="rounded-full border border-neutral-700 px-3 py-1 text-xs hover:border-white"
                    onClick={() => updateStatus(listing.id, "SOLD")}
                  >
                    Продан
                  </button>
                  <button
                    className="rounded-full border border-neutral-700 px-3 py-1 text-xs hover:border-white"
                    onClick={() => updateStatus(listing.id, "HIDDEN")}
                  >
                    Скрыть
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
