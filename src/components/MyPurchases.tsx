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
  status: "RESERVED" | "DISPUTED" | "SOLD";
  images: { id: string }[];
  tags: { tag: { id: string; name: string } }[];
  game?: { id: string; name: string };
  server?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  seller?: { username?: string | null; lastSeenAt?: string | null };
};

type ListingsResponse = { listings: Listing[] };

function getInitData(): string {
  if (typeof window === "undefined") return "";
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } })
    .Telegram;
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

function normalizeContact(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("@")) return `https://t.me/${value.slice(1)}`;
  if (value.includes("t.me/")) return `https://${value.replace(/^https?:\/\//, "")}`;
  return `https://t.me/${value}`;
}

function formatPrice(listing: Listing) {
  if (listing.type !== "SALE") {
    return `Обмен: ${listing.tradeNote ?? "-"}`;
  }
  const stars = listing.priceStars ?? null;
  if (stars === null) return "Цена: -";
  return `Цена: ${stars} TC`;
}

function formatStatus(status: Listing["status"]) {
  if (status === "RESERVED") return "Ожидает подтверждения";
  if (status === "DISPUTED") return "Спор";
  if (status === "SOLD") return "Сделка закрыта";
  return status;
}

export default function MyPurchases() {
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
    fetch("/api/my/purchases", {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: ListingsResponse) => setListings(data.listings || []))
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

  const confirmPurchase = async (listingId: string) => {
    if (!initData && !hasAuth) {
      setStatus("Войдите через Telegram, чтобы подтвердить сделку.");
      return;
    }
    setStatus("Подтверждаем сделку...");
    const res = await fetch(`/api/listings/${listingId}/confirm`, {
      method: "POST",
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || "Не удалось подтвердить сделку");
      return;
    }
    setStatus("Сделка подтверждена");
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, status: "SOLD" } : item)),
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("wallet:refresh"));
    }
  };

  const openDispute = async (listingId: string) => {
    if (!initData && !hasAuth) {
      setStatus("Войдите через Telegram, чтобы открыть спор.");
      return;
    }
    const reason = window.prompt("Причина спора:", "Продавец не выполнил условия");
    if (!reason) return;

    setStatus("Открываем спор...");
    const res = await fetch(`/api/listings/${listingId}/dispute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(initData ? { "x-telegram-init-data": initData } : {}),
      },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || "Не удалось открыть спор");
      return;
    }
    setStatus("Спор открыт, ожидайте решения админа.");
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, status: "DISPUTED" } : item)),
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10">
        <TopNav />
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Мои покупки</h2>
          <span className="text-xs text-neutral-400">{status}</span>
        </header>

        {!initData && !hasAuth ? (
          <p className="text-sm text-amber-400">Войдите через Telegram, чтобы видеть покупки.</p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {listings.map((listing) => {
            const sellerUsername = listing.seller?.username;
            const contact = normalizeContact(sellerUsername ? `@${sellerUsername}` : "");
            const online = isSellerOnline(listing.seller?.lastSeenAt);
            return (
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
                    {formatStatus(listing.status)}
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
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-neutral-300">
                    {formatPrice(listing)}
                    {listing.feePercent ? (
                      <span className="ml-2 text-xs text-neutral-500">Комиссия {listing.feePercent}% включена</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-2 text-xs text-neutral-400">
                      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-neutral-600"}`} />
                      {online ? "Онлайн" : "Оффлайн"}
                    </span>
                    {contact ? (
                      <button
                        className="rounded-full border border-neutral-700 px-3 py-1 text-xs hover:border-white"
                        onClick={() => window.open(contact, "_blank")}
                      >
                        Написать продавцу
                      </button>
                    ) : null}
                    {listing.status === "RESERVED" ? (
                      <>
                        <button
                          className="rounded-full border border-emerald-400/70 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-300"
                          onClick={() => confirmPurchase(listing.id)}
                        >
                          Подтвердить сделку
                        </button>
                        <button
                          className="rounded-full border border-amber-400/70 px-3 py-1 text-xs text-amber-200 hover:border-amber-300"
                          onClick={() => openDispute(listing.id)}
                        >
                          Открыть спор
                        </button>
                      </>
                    ) : null}
                    {listing.status === "DISPUTED" ? (
                      <span className="rounded-full border border-amber-500/70 px-3 py-1 text-xs text-amber-200">
                        Спор на рассмотрении
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}

