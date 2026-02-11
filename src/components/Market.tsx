"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";

type Game = {
  id: string;
  name: string;
  servers: { id: string; name: string }[];
  categories: { id: string; name: string; parentId?: string | null }[];
  tags: { id: string; name: string }[];
};

type Listing = {
  id: string;
  title: string;
  description?: string | null;
  type: "SALE" | "TRADE";
  price?: string | null;
  currency?: string | null;
  tradeNote?: string | null;
  contactAlt?: string | null;
  status?: "ACTIVE" | "RESERVED" | "SOLD" | "HIDDEN";
  priceStars?: number | null;
  feeStars?: number | null;
  feePercent?: number | null;
  isBuyer?: boolean;
  images: { id: string }[];
  tags: { tag: { id: string; name: string } }[];
  game?: { id: string; name: string };
  server?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  seller?: { username?: string | null; lastSeenAt?: string | null };
  isFavorite?: boolean;
};

type CatalogResponse = { games: Game[] };
type ListingsResponse = { listings: Listing[]; total: number; page: number; pageSize: number };

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

function getListingIdFromUrl(): string {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const raw =
      searchParams.get("listingId") ||
      searchParams.get("tgWebAppStartParam") ||
      searchParams.get("startapp") ||
      "";
    return normalizeListingId(raw);
  } catch {
    return "";
  }
}

function normalizeListingId(value: string): string {
  if (!value) return "";
  return value.startsWith("l_") ? value.slice(2) : value;
}

function isSellerOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const last = new Date(lastSeenAt).getTime();
  if (Number.isNaN(last)) return false;
  return Date.now() - last < 5 * 60 * 1000;
}

function formatStatus(status?: Listing["status"]) {
  switch (status) {
    case "RESERVED":
      return "Ожидает подтверждения";
    case "SOLD":
      return "Продан";
    case "HIDDEN":
      return "Скрыт";
    default:
      return "";
  }
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

export default function Market() {
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [gameId, setGameId] = useState("");
  const [serverId, setServerId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("NEWEST");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [initData, setInitData] = useState("");
  const [hasAuth, setHasAuth] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [payableOnly, setPayableOnly] = useState(false);
  const [sharedListingId, setSharedListingId] = useState("");
  const [sharedListing, setSharedListing] = useState<Listing | null>(null);
  const [sharedError, setSharedError] = useState("");

  useEffect(() => {
    let attempts = 0;
    const read = () => {
      const value = getInitData();
      if (value) {
        setInitData(value);
        return;
      }
      if (attempts < 5) {
        attempts += 1;
        setTimeout(read, 300);
      }
    };
    read();
  }, []);

  useEffect(() => {
    const readListingId = () => {
      const value = getListingIdFromUrl();
      setSharedListingId(value);
    };
    readListingId();
    if (typeof window === "undefined") return undefined;
    const handler = () => readListingId();
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  useEffect(() => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data: CatalogResponse) => setCatalog(data.games))
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (gameId) params.set("gameId", gameId);
    if (serverId) params.set("serverId", serverId);
    if (categoryId) params.set("categoryId", categoryId);
    if (tagId) params.set("tagId", tagId);
    if (type) params.set("type", type);
    if (payableOnly) params.set("payable", "1");
    if (sort) params.set("sort", sort);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    fetch(`/api/listings?${params.toString()}`, {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: ListingsResponse) => {
        setListings(data.listings || []);
        setTotal(data.total || 0);
      })
      .catch(() => setListings([]));
  }, [search, gameId, serverId, categoryId, tagId, type, payableOnly, sort, page, initData]);

  useEffect(() => {
    if (!sharedListingId) {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/listings/${sharedListingId}`, {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: { listing?: Listing }) => {
        setSharedListing(data.listing ?? null);
        setSharedError(data.listing ? "" : "Лот не найден или больше недоступен.");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSharedListing(null);
          setSharedError("Лот не найден или больше недоступен.");
        }
      });
    return () => controller.abort();
  }, [sharedListingId, initData]);

  useEffect(() => {
    if (!initData) return;
    const headers = initData ? { "x-telegram-init-data": initData } : undefined;
    fetch("/api/auth/me", { headers })
      .then((res) => res.json())
      .then((data: { ok?: boolean }) => setHasAuth(Boolean(data.ok)))
      .catch(() => setHasAuth(false));
  }, [initData]);

  useEffect(() => {
    if (!initData && !hasAuth) return;
    fetch("/api/wallet", {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: { balance?: number }) => setWalletBalance(Number(data.balance ?? 0)))
      .catch(() => setWalletBalance(null));
  }, [initData, hasAuth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (!initData && !hasAuth) return;
      fetch("/api/wallet", {
        headers: initData ? { "x-telegram-init-data": initData } : undefined,
      })
        .then((res) => res.json())
        .then((data: { balance?: number }) => setWalletBalance(Number(data.balance ?? 0)))
        .catch(() => setWalletBalance(null));
    };
    window.addEventListener("wallet:refresh", handler);
    return () => window.removeEventListener("wallet:refresh", handler);
  }, [initData, hasAuth]);

  const game = catalog.find((g) => g.id === gameId);
  const servers = game?.servers ?? [];
  const categories = game?.categories ?? [];
  const tags = game?.tags ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canUseWallet = Boolean(initData || hasAuth);
  const displayedWalletBalance = canUseWallet ? walletBalance : null;

  const toggleFavorite = async (listingId: string, next: boolean) => {
    if (!initData && !hasAuth) {
      setStatus("Войдите через Telegram, чтобы пользоваться избранным.");
      return;
    }
    const res = await fetch(`/api/favorites/${listingId}`, {
      method: next ? "POST" : "DELETE",
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Ошибка: ${err.error?.message || err.error || res.statusText}`);
      return;
    }
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, isFavorite: next } : item)),
    );
  };

  const buyListing = async (listingId: string) => {
    if (!initData && !hasAuth) {
      setStatus("Войдите через Telegram, чтобы покупать.");
      return;
    }
    setStatus("Создаем сделку...");
    const res = await fetch(`/api/listings/${listingId}/purchase`, {
      method: "POST",
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || "Покупка не удалась");
      return;
    }
    setStatus("Сделка создана. Средства заморожены до подтверждения.");
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, status: "RESERVED", isBuyer: true } : item)),
    );
    if (sharedListing?.id === listingId) {
      setSharedListing({ ...sharedListing, status: "RESERVED", isBuyer: true });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("wallet:refresh"));
    }
  };

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
    setListings((prev) => prev.map((item) => (item.id === listingId ? { ...item, status: "SOLD" } : item)));
    if (sharedListing?.id === listingId) {
      setSharedListing({ ...sharedListing, status: "SOLD" });
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("wallet:refresh"));
    }
  };

  const canAfford = (priceStars?: number | null) => {
    if (walletBalance === null) return false;
    const value = Number(priceStars);
    if (!Number.isFinite(value)) return false;
    return walletBalance >= value;
  };

  const resetPage = () => setPage(1);
  const clearShared = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("listingId");
    url.searchParams.delete("tgWebAppStartParam");
    url.searchParams.delete("startapp");
    window.history.replaceState({}, "", url.toString());
    setSharedListing(null);
    setSharedError("");
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
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">Рынок игровых лотов</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-400">{status}</span>
              <button
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm hover:border-white hover:text-white"
                onClick={() => setCreating((v) => !v)}
              >
                {creating ? "Скрыть форму" : "Создать лот"}
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Поиск по названию или описанию"
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />
            <select
              value={gameId}
              onChange={(e) => {
                setGameId(e.target.value);
                setServerId("");
                setCategoryId("");
                setTagId("");
                resetPage();
              }}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Все игры</option>
              {catalog.map((gameItem) => (
                <option key={gameItem.id} value={gameItem.id}>
                  {gameItem.name}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => {
                const next = e.target.value;
                setType(next);
                if (next !== "SALE" && payableOnly) {
                  setPayableOnly(false);
                }
                resetPage();
              }}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Все типы</option>
              <option value="SALE">Продажа</option>
              <option value="TRADE">Обмен</option>
            </select>
            <label className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={payableOnly}
                onChange={(e) => {
                  const next = e.target.checked;
                  setPayableOnly(next);
                  if (next && type !== "SALE") {
                    setType("SALE");
                  }
                  resetPage();
                }}
                className="h-4 w-4 accent-white"
              />
              Только покупка за TC
            </label>
            <select
              value={serverId}
              onChange={(e) => {
                setServerId(e.target.value);
                resetPage();
              }}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Все серверы</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                resetPage();
              }}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Все категории</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <select
              value={tagId}
              onChange={(e) => {
                setTagId(e.target.value);
                resetPage();
              }}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Все теги</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  #{tag.name}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => {
                const nextSort = e.target.value;
                setSort(nextSort);
                if ((nextSort === "PRICE_ASC" || nextSort === "PRICE_DESC") && type !== "SALE") {
                  setType("SALE");
                }
                resetPage();
              }}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="NEWEST">Сначала новые</option>
              <option value="OLDEST">Сначала старые</option>
              <option value="PRICE_ASC">Цена по возрастанию (только продажа)</option>
              <option value="PRICE_DESC">Цена по убыванию (только продажа)</option>
            </select>
          </div>
        </header>

        {creating ? <CreateListing catalog={catalog} initData={initData} hasAuth={hasAuth} /> : null}

        {sharedListing ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-neutral-500">
              <span>Лот из ссылки</span>
              <button className="rounded-full border border-neutral-800 px-3 py-1 text-[11px] hover:border-white" onClick={clearShared}>
                Скрыть
              </button>
            </div>
            <article className="rounded-3xl border border-amber-400/70 bg-amber-500/10 p-5">
              {sharedListing.images[0] ? (
                <img
                  src={`/api/images/${sharedListing.images[0].id}`}
                  alt={sharedListing.title}
                  className="mb-4 h-40 w-full rounded-2xl object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{sharedListing.title}</h3>
                  <p className="text-sm text-neutral-400">
                    {sharedListing.game?.name}
                    {sharedListing.server?.name ? ` · ${sharedListing.server.name}` : ""}
                    {sharedListing.category?.name ? ` · ${sharedListing.category.name}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    className={`rounded-full border px-2 py-1 text-xs ${
                      sharedListing.isFavorite ? "border-amber-400 text-amber-300" : "border-neutral-700 text-neutral-300"
                    }`}
                    onClick={() => toggleFavorite(sharedListing.id, !sharedListing.isFavorite)}
                  >
                    ?
                  </button>
                  <button
                    className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-white"
                    onClick={() => shareListing(sharedListing)}
                  >
                    Поделиться
                  </button>
                  <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider">
                    {sharedListing.type === "SALE" ? "Продажа" : "Обмен"}
                  </span>
                  {sharedListing.status && sharedListing.status !== "ACTIVE" ? (
                    <span className="rounded-full border border-amber-400/70 px-3 py-1 text-xs uppercase tracking-wider text-amber-200">
                      {formatStatus(sharedListing.status)}
                    </span>
                  ) : null}
                </div>
              </div>
              {sharedListing.description ? <p className="mt-3 text-sm text-neutral-200">{sharedListing.description}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-300">
                {sharedListing.tags.map((tag) => (
                  <span key={tag.tag.id} className="rounded-full border border-neutral-800 px-3 py-1">
                    #{tag.tag.name}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-neutral-100">
                  {formatPrice(sharedListing)}
                  {sharedListing.feePercent ? (
                    <span className="ml-2 text-xs text-neutral-400">Комиссия {sharedListing.feePercent}% включена</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sharedListing.type === "SALE" &&
                  (sharedListing.currency || "").toUpperCase() === "RUB" &&
                  sharedListing.status === "ACTIVE" ? (
                    <button
                      className={`rounded-full border px-3 py-1 text-xs ${
                        canAfford(sharedListing.priceStars)
                          ? "border-emerald-400/70 text-emerald-200 hover:border-emerald-300"
                          : "border-neutral-700 text-neutral-500"
                      }`}
                      onClick={() => buyListing(sharedListing.id)}
                      disabled={!canAfford(sharedListing.priceStars)}
                    >
                      Купить за {sharedListing.priceStars ?? "-"} TC
                    </button>
                  ) : null}
                  {sharedListing.status === "RESERVED" && sharedListing.isBuyer ? (
                    <button
                      className="rounded-full border border-emerald-400/70 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-300"
                      onClick={() => confirmPurchase(sharedListing.id)}
                    >
                      Подтвердить сделку
                    </button>
                  ) : null}
                  {displayedWalletBalance !== null ? (
                    <span className="text-xs text-neutral-400">Баланс: {displayedWalletBalance} TC</span>
                  ) : null}
                  <ContactButton listing={sharedListing} />
                </div>
              </div>
            </article>
          </div>
        ) : sharedError ? (
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 px-5 py-4 text-sm text-neutral-300">
            {sharedError}
          </div>
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
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    className={`rounded-full border px-2 py-1 text-xs ${
                      listing.isFavorite ? "border-amber-400 text-amber-300" : "border-neutral-700 text-neutral-400"
                    }`}
                    onClick={() => toggleFavorite(listing.id, !listing.isFavorite)}
                  >
                    ?
                  </button>
                  <button
                    className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-white"
                    onClick={() => shareListing(listing)}
                  >
                    Поделиться
                  </button>
                  <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider">
                    {listing.type === "SALE" ? "Продажа" : "Обмен"}
                  </span>
                  {listing.status && listing.status !== "ACTIVE" ? (
                    <span className="rounded-full border border-amber-400/70 px-3 py-1 text-xs uppercase tracking-wider text-amber-200">
                      {formatStatus(listing.status)}
                    </span>
                  ) : null}
                </div>
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
                  {listing.type === "SALE" &&
                  (listing.currency || "").toUpperCase() === "RUB" &&
                  listing.status === "ACTIVE" ? (
                    <button
                      className={`rounded-full border px-3 py-1 text-xs ${
                        canAfford(listing.priceStars)
                          ? "border-emerald-400/70 text-emerald-200 hover:border-emerald-300"
                          : "border-neutral-700 text-neutral-500"
                      }`}
                      onClick={() => buyListing(listing.id)}
                      disabled={!canAfford(listing.priceStars)}
                    >
                      Купить за {listing.priceStars ?? "-"} TC
                    </button>
                  ) : null}
                  {listing.status === "RESERVED" && listing.isBuyer ? (
                    <button
                      className="rounded-full border border-emerald-400/70 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-300"
                      onClick={() => confirmPurchase(listing.id)}
                    >
                      Подтвердить сделку
                    </button>
                  ) : null}
                  {displayedWalletBalance !== null ? (
                    <span className="text-xs text-neutral-400">Баланс: {displayedWalletBalance} TC</span>
                  ) : null}
                  <ContactButton listing={listing} />
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

function ContactButton({ listing }: { listing: Listing }) {
  const username = listing.seller?.username;
  const rawContact = username ? `https://t.me/${username}` : listing.contactAlt || "";
  const contact = normalizeContact(rawContact);
  const online = isSellerOnline(listing.seller?.lastSeenAt || null);
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2 text-xs text-neutral-400">
        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-neutral-600"}`} />
        {online ? "Онлайн" : "Оффлайн"}
      </span>
      <button
        className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"
        onClick={() => {
          if (contact) {
            window.open(contact, "_blank");
          } else {
            alert("Контакт не указан");
          }
        }}
      >
        Написать в TG
      </button>
    </div>
  );
}

function normalizeContact(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("@")) return `https://t.me/${value.slice(1)}`;
  if (value.includes("t.me/")) return `https://${value.replace(/^https?:\/\//, "")}`;
  return `https://t.me/${value}`;
}

function buildShareUrl(listingId: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(`/l/${listingId}`, window.location.origin);
  return url.toString();
}

function buildShareText(listing: Listing): string {
  const detail =
    listing.type === "SALE"
      ? `Цена: ${listing.priceStars ?? "-"} TC`
      : `Обмен: ${listing.tradeNote ?? "-"}`;
  const raw = `${listing.title} · ${detail}`.trim();
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

function CreateListing({ catalog, initData, hasAuth }: { catalog: Game[]; initData: string; hasAuth: boolean }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"SALE" | "TRADE">("SALE");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [tradeNote, setTradeNote] = useState("");
  const [contactAlt, setContactAlt] = useState("");
  const [gameId, setGameId] = useState("");
  const [serverId, setServerId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [images, setImages] = useState<File[]>([]);

  const game = catalog.find((g) => g.id === gameId);

  const toggleTag = (id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!initData && !hasAuth) {
      setStatus("Войдите через Telegram, чтобы создать лот.");
      return;
    }
    setStatus("Отправляем...");
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description || "");
    formData.append("type", type);
    if (type === "SALE") {
      formData.append("price", price);
      formData.append("currency", currency);
    } else {
      formData.append("tradeNote", tradeNote);
    }
    formData.append("contactAlt", contactAlt);
    formData.append("gameId", gameId);
    if (serverId) formData.append("serverId", serverId);
    if (categoryId) formData.append("categoryId", categoryId);
    tagIds.forEach((id) => formData.append("tagIds", id));
    images.forEach((file) => formData.append("images", file));

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: initData ? { "x-telegram-init-data": initData } : undefined,
        body: formData,
      });
      const rawText = await res.text();
      let data: unknown = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        const message = formatApiError(data, res.status, res.statusText, rawText);
        setStatus(`Ошибка: ${message}`);
        return;
      }

      setStatus("Лот создан");
      setTitle("");
      setDescription("");
      setPrice("");
      setTradeNote("");
      setContactAlt("");
      setImages([]);
    } catch (error) {
      setStatus(`Ошибка сети: ${error instanceof Error ? error.message : "неизвестно"}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
      <h2 className="text-lg font-semibold">Новый лот</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
          required
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "SALE" | "TRADE")}
          className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
        >
          <option value="SALE">Продажа</option>
          <option value="TRADE">Обмен</option>
        </select>
        <select
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
          required
        >
          <option value="">Игра</option>
          {catalog.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
        >
          <option value="">Сервер</option>
          {game?.servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
        >
          <option value="">Категория</option>
          {game?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={contactAlt}
          onChange={(e) => setContactAlt(e.target.value)}
          placeholder="Контакт, если нет @username"
          className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (необязательно)"
        className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
        rows={4}
      />
      {type === "SALE" ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Цена (в рублях)"
            className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            required
          />
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="Валюта"
            className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            required
          />
          <p className="text-xs text-neutral-500 md:col-span-2">
            Покупатели увидят цену в TC с учетом комиссии платформы.
          </p>
        </div>
      ) : (
        <input
          value={tradeNote}
          onChange={(e) => setTradeNote(e.target.value)}
          placeholder="Что хотите в обмен"
          className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
          required
        />
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {game?.tags.map((tag) => (
          <button
            type="button"
            key={tag.id}
            onClick={() => toggleTag(tag.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              tagIds.includes(tag.id) ? "border-white text-white" : "border-neutral-800 text-neutral-400"
            }`}
          >
            #{tag.name}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label className="text-xs uppercase tracking-[0.3em] text-neutral-500">Скриншоты (до 5)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            setImages(files.slice(0, 5));
          }}
          className="mt-2 block w-full text-sm text-neutral-300 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-semibold file:text-black"
        />
        {images.length ? <p className="mt-2 text-xs text-neutral-400">Выбрано файлов: {images.length}</p> : null}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black">Опубликовать</button>
        <span className="text-xs text-neutral-400">{status}</span>
      </div>
    </form>
  );
}

function formatApiError(payload: unknown, status: number, statusText: string, rawText?: string) {
  const data = payload as { error?: unknown; message?: string };
  const fallback = statusText || `HTTP ${status}` || "Неизвестная ошибка";
  if (!data) return fallback;
  if (typeof data.error === "string" && data.error) return data.error;
  if (typeof data.message === "string" && data.message) return data.message;
  if (data.error && typeof data.error === "object") {
    const err = data.error as { message?: string; fieldErrors?: Record<string, string[]>; formErrors?: string[] };
    if (err.message) return err.message;
    if (err.formErrors?.length) return err.formErrors.join("; ");
    if (err.fieldErrors) {
      const parts = Object.entries(err.fieldErrors).flatMap(([field, messages]) =>
        Array.isArray(messages) ? messages.map((m) => `${field}: ${m}`) : [],
      );
      if (parts.length) return parts.join("; ");
    }
  }
  if (rawText) {
    const trimmed = rawText.replace(/\s+/g, " ").trim();
    if (trimmed) return `${fallback}: ${trimmed.slice(0, 180)}`;
  }
  return fallback;
}
