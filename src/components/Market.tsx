"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

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
  images: { id: string }[];
  tags: { tag: { id: string; name: string } }[];
  game?: { id: string; name: string };
  server?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  seller?: { username?: string | null };
};

type CatalogResponse = { games: Game[] };
type ListingsResponse = { listings: Listing[] };

function getInitData(): string {
  if (typeof window === "undefined") return "";
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData || "";
}

export default function Market() {
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [search, setSearch] = useState("");
  const [gameId, setGameId] = useState("");
  const [type, setType] = useState("");
  const [creating, setCreating] = useState(false);

  const initData = useMemo(() => getInitData(), []);

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
    if (type) params.set("type", type);
    fetch(`/api/listings?${params.toString()}`)
      .then((res) => res.json())
      .then((data: ListingsResponse) => setListings(data.listings))
      .catch(() => setListings([]));
  }, [search, gameId, type]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">TradeBay</p>
              <h1 className="text-3xl font-semibold tracking-tight">Рынок игровых лотов</h1>
            </div>
            <button
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm hover:border-white hover:text-white"
              onClick={() => setCreating((v) => !v)}
            >
              {creating ? "Скрыть форму" : "Создать лот"}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или описанию"
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            />
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Все игры</option>
              {catalog.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Все типы</option>
              <option value="SALE">Продажа</option>
              <option value="TRADE">Обмен</option>
            </select>
          </div>
        </header>

        {creating ? <CreateListing catalog={catalog} initData={initData} /> : null}

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
                  {listing.type === "SALE"
                    ? `Цена: ${listing.price ?? "-"} ${listing.currency ?? ""}`
                    : `Обмен: ${listing.tradeNote ?? "-"}`}
                </div>
                <ContactButton listing={listing} />
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function ContactButton({ listing }: { listing: Listing }) {
  const username = listing.seller?.username;
  const rawContact = username ? `https://t.me/${username}` : listing.contactAlt || "";
  const contact = normalizeContact(rawContact);
  return (
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
  );
}

function normalizeContact(value: string): string {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("@")) return `https://t.me/${value.slice(1)}`;
  if (value.includes("t.me/")) return `https://${value.replace(/^https?:\/\//, "")}`;
  return `https://t.me/${value}`;
}

function CreateListing({ catalog, initData }: { catalog: Game[]; initData: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"SALE" | "TRADE">("SALE");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
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

    const res = await fetch("/api/listings", {
      method: "POST",
      headers: {
        "x-telegram-init-data": initData,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Ошибка: ${err.error?.message || err.error || res.statusText}`);
      return;
    }

    setStatus("Лот создан");
    setTitle("");
    setDescription("");
    setPrice("");
    setTradeNote("");
    setContactAlt("");
    setImages([]);
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
            placeholder="Цена"
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
