"use client";

import { useEffect, useState } from "react";

type Game = {
  id: string;
  name: string;
  servers: { id: string; name: string }[];
  categories: { id: string; name: string; parentId?: string | null }[];
  tags: { id: string; name: string }[];
};

type CatalogResponse = { games: Game[] };

function getInitData(): string {
  if (typeof window === "undefined") return "";
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return tg?.WebApp?.initData || "";
}

export default function AdminPanel() {
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [status, setStatus] = useState("");
  const [gameName, setGameName] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverGameId, setServerGameId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryGameId, setCategoryGameId] = useState("");
  const [categoryParentId, setCategoryParentId] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagGameId, setTagGameId] = useState("");

  const [initData, setInitData] = useState("");

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

  const loadCatalog = () => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data: CatalogResponse) => setCatalog(data.games))
      .catch(() => setCatalog([]));
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const createEntity = async (url: string, payload: Record<string, unknown>) => {
    setStatus("Сохраняем...");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": initData,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Ошибка: ${err.error?.message || err.error || res.statusText}`);
      return;
    }

    setStatus("Готово");
    loadCatalog();
  };

  const selectedGameForCategory = catalog.find((game) => game.id === categoryGameId);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">TradeBay Admin</p>
          <h1 className="text-3xl font-semibold tracking-tight">Каталог и теги</h1>
          {!initData ? (
            <p className="text-sm text-amber-400">Откройте страницу из Telegram Web App для прав админа.</p>
          ) : null}
          <p className="text-xs text-neutral-500">{status}</p>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!gameName.trim()) return;
              createEntity("/api/admin/games", { name: gameName.trim() });
              setGameName("");
            }}
            className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <h2 className="text-lg font-semibold">Игры</h2>
            <input
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="Название игры"
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              required
            />
            <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
              Добавить
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!serverName.trim() || !serverGameId) return;
              createEntity("/api/admin/servers", { name: serverName.trim(), gameId: serverGameId });
              setServerName("");
            }}
            className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <h2 className="text-lg font-semibold">Серверы</h2>
            <select
              value={serverGameId}
              onChange={(event) => setServerGameId(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              required
            >
              <option value="">Выбери игру</option>
              {catalog.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            <input
              value={serverName}
              onChange={(event) => setServerName(event.target.value)}
              placeholder="Название сервера"
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              required
            />
            <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
              Добавить
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!categoryName.trim() || !categoryGameId) return;
              createEntity("/api/admin/categories", {
                name: categoryName.trim(),
                gameId: categoryGameId,
                parentId: categoryParentId || null,
              });
              setCategoryName("");
            }}
            className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <h2 className="text-lg font-semibold">Категории</h2>
            <select
              value={categoryGameId}
              onChange={(event) => {
                setCategoryGameId(event.target.value);
                setCategoryParentId("");
              }}
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              required
            >
              <option value="">Выбери игру</option>
              {catalog.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            <input
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Название категории"
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              required
            />
            <select
              value={categoryParentId}
              onChange={(event) => setCategoryParentId(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
            >
              <option value="">Без родителя</option>
              {selectedGameForCategory?.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
              Добавить
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!tagName.trim() || !tagGameId) return;
              createEntity("/api/admin/tags", { name: tagName.trim(), gameId: tagGameId });
              setTagName("");
            }}
            className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <h2 className="text-lg font-semibold">Теги</h2>
            <select
              value={tagGameId}
              onChange={(event) => setTagGameId(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              required
            >
              <option value="">Выбери игру</option>
              {catalog.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            <input
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              placeholder="Название тега"
              className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
              required
            />
            <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">
              Добавить
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <h2 className="text-lg font-semibold">Текущий каталог</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {catalog.map((game) => (
              <div key={game.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <h3 className="text-sm font-semibold">{game.name}</h3>
                <p className="mt-2 text-xs text-neutral-400">
                  Серверов: {game.servers.length} · Категорий: {game.categories.length} · Тегов:{" "}
                  {game.tags.length}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-neutral-500">
                  {game.categories.slice(0, 6).map((category) => (
                    <span key={category.id} className="rounded-full border border-neutral-800 px-2 py-1">
                      {category.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
