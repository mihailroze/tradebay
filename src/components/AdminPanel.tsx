"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";

type Game = {
  id: string;
  name: string;
  servers: { id: string; name: string }[];
  categories: { id: string; name: string; parentId?: string | null }[];
  tags: { id: string; name: string }[];
};

type CatalogResponse = { games: Game[] };

type AuthInfo = {
  ok: boolean;
  error?: string;
  isAdmin?: boolean;
  user?: {
    id: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

type ListingReport = {
  id: string;
  reason: string;
  status: "OPEN" | "RESOLVED" | "REJECTED";
  createdAt: string;
  adminNote: string | null;
  listing: {
    id: string;
    title: string;
    status: string;
    seller: { telegramId: string; username: string | null } | null;
  };
  reporter: { telegramId: string; username: string | null };
  resolvedBy: { telegramId: string; username: string | null } | null;
};

type ReportsResponse = { reports: ListingReport[] };

type DisputeListing = {
  id: string;
  title: string;
  status: "RESERVED" | "DISPUTED" | "SOLD" | "ACTIVE" | "HIDDEN";
  disputedAt: string | null;
  disputeReason: string | null;
  reservedAt: string | null;
  reservationExpiresAt: string | null;
  holdAmount: number | null;
  feeAmount: number | null;
  seller: { telegramId: string; username: string | null; displayName: string | null } | null;
  buyer: { telegramId: string; username: string | null; displayName: string | null } | null;
};

type DisputesResponse = { disputes: DisputeListing[] };

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

function getInitData(): string {
  if (typeof window === "undefined") return "";
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } }).Telegram;
  tg?.WebApp?.ready?.();
  const fromTelegram = tg?.WebApp?.initData || "";
  const fromUrl = readInitDataFromUrl();
  const cached = window.sessionStorage.getItem("tg_init_data") || "";
  const value = fromTelegram || fromUrl || cached;
  if (value) window.sessionStorage.setItem("tg_init_data", value);
  return value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU");
}

export default function AdminPanel() {
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [initData, setInitData] = useState("");
  const [status, setStatus] = useState("");
  const [reports, setReports] = useState<ListingReport[]>([]);
  const [reportFilter, setReportFilter] = useState<"OPEN" | "RESOLVED" | "REJECTED" | "ALL">("OPEN");
  const [disputes, setDisputes] = useState<DisputeListing[]>([]);

  const [gameName, setGameName] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverGameId, setServerGameId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryGameId, setCategoryGameId] = useState("");
  const [categoryParentId, setCategoryParentId] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagGameId, setTagGameId] = useState("");

  useEffect(() => {
    let attempts = 0;
    const read = () => {
      const value = getInitData();
      if (value) {
        setInitData(value);
        return;
      }
      if (attempts < 15) {
        attempts += 1;
        setTimeout(read, 300);
      }
    };
    read();
  }, []);

  const authHeaders = useMemo(() => {
    return initData ? { "x-telegram-init-data": initData } : undefined;
  }, [initData]);

  const loadCatalog = useCallback(() => {
    fetch("/api/catalog")
      .then((res) => res.json())
      .then((data: CatalogResponse) => setCatalog(data.games || []))
      .catch(() => setCatalog([]));
  }, []);

  const loadReports = useCallback(() => {
    const query = reportFilter === "ALL" ? "" : `?status=${reportFilter}`;
    fetch(`/api/admin/reports${query}`, { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: ReportsResponse) => setReports(data.reports || []))
      .catch(() => setReports([]));
  }, [authHeaders, reportFilter]);

  const loadDisputes = useCallback(() => {
    fetch("/api/admin/disputes", { headers: authHeaders })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: DisputesResponse) => setDisputes(data.disputes || []))
      .catch(() => setDisputes([]));
  }, [authHeaders]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    fetch("/api/auth/me", { headers: authHeaders })
      .then((res) => res.json())
      .then((data: AuthInfo) => setAuthInfo(data))
      .catch(() => setAuthInfo({ ok: false, error: "Failed to load auth info" }));
  }, [authHeaders]);

  useEffect(() => {
    if (!authInfo?.ok || !authInfo.isAdmin) return;
    loadReports();
    loadDisputes();
  }, [authInfo?.ok, authInfo?.isAdmin, loadReports, loadDisputes]);

  const createEntity = async (url: string, payload: Record<string, unknown>) => {
    if (!authInfo?.ok) {
      setStatus("Войдите через Telegram, чтобы управлять каталогом.");
      return;
    }

    setStatus("Сохраняем...");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeaders || {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({} as { error?: unknown }));
      const message =
        typeof err.error === "string"
          ? err.error
          : res.statusText || "Ошибка сохранения";
      setStatus(`Ошибка: ${message}`);
      return;
    }

    setStatus("Готово");
    loadCatalog();
  };

  const updateReport = async (reportId: string, action: "RESOLVE" | "REJECT" | "HIDE_LISTING") => {
    const adminNote = window.prompt("Комментарий модератора (необязательно):", "") || undefined;
    setStatus("Обновляем жалобу...");

    const res = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(authHeaders || {}),
      },
      body: JSON.stringify({ reportId, action, adminNote }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: unknown }));
      setStatus(typeof data.error === "string" ? data.error : "Не удалось обновить жалобу");
      return;
    }

    setStatus("Жалоба обновлена");
    loadReports();
  };

  const resolveDispute = async (listingId: string, action: "RELEASE" | "REFUND") => {
    const note = window.prompt("Комментарий/причина (необязательно):", "") || undefined;
    setStatus("Решаем спор...");

    const res = await fetch(`/api/admin/disputes/${listingId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeaders || {}),
      },
      body: JSON.stringify({ action, note }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({} as { error?: unknown }));
      setStatus(typeof data.error === "string" ? data.error : "Не удалось решить спор");
      return;
    }

    setStatus("Спор обработан");
    loadDisputes();
    loadReports();
  };

  const selectedGameForCategory = catalog.find((game) => game.id === categoryGameId);

  const canUseAdmin = Boolean(authInfo?.ok && authInfo?.isAdmin);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-10">
        <TopNav />

        <header className="flex flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Админ-панель</h2>
          <p className="text-sm text-neutral-400">Каталог, жалобы и споры.</p>
          {authInfo?.ok ? (
            <p className="text-xs text-neutral-400">
              TG ID: {authInfo.user?.id} · Admin: {authInfo.isAdmin ? "yes" : "no"}
            </p>
          ) : authInfo?.error ? (
            <p className="text-xs text-amber-400">Auth: {authInfo.error}</p>
          ) : null}
          <p className="text-xs text-neutral-500">{status}</p>
        </header>

        {!canUseAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-amber-300">
            Откройте страницу из Telegram Web App под админ-аккаунтом.
          </section>
        ) : null}

        {canUseAdmin ? (
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
              <h3 className="text-lg font-semibold">Игры</h3>
              <input
                value={gameName}
                onChange={(event) => setGameName(event.target.value)}
                placeholder="Название игры"
                className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
                required
              />
              <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
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
              <h3 className="text-lg font-semibold">Серверы</h3>
              <select
                value={serverGameId}
                onChange={(event) => setServerGameId(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
                required
              >
                <option value="">Выберите игру</option>
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
              <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
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
              <h3 className="text-lg font-semibold">Категории</h3>
              <select
                value={categoryGameId}
                onChange={(event) => {
                  setCategoryGameId(event.target.value);
                  setCategoryParentId("");
                }}
                className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
                required
              >
                <option value="">Выберите игру</option>
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
              <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
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
              <h3 className="text-lg font-semibold">Теги</h3>
              <select
                value={tagGameId}
                onChange={(event) => setTagGameId(event.target.value)}
                className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-neutral-500"
                required
              >
                <option value="">Выберите игру</option>
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
              <button className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
            </form>
          </section>
        ) : null}

        {canUseAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Жалобы</h3>
              <div className="flex items-center gap-2">
                <select
                  value={reportFilter}
                  onChange={(event) => setReportFilter(event.target.value as "OPEN" | "RESOLVED" | "REJECTED" | "ALL")}
                  className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs"
                >
                  <option value="OPEN">Открытые</option>
                  <option value="RESOLVED">Решенные</option>
                  <option value="REJECTED">Отклоненные</option>
                  <option value="ALL">Все</option>
                </select>
                <button
                  className="rounded-full border border-neutral-700 px-3 py-2 text-xs hover:border-white"
                  onClick={loadReports}
                >
                  Обновить
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {reports.length ? (
                reports.map((report) => (
                  <article key={report.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{report.listing.title}</p>
                      <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] uppercase tracking-wider">
                        {report.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                      listing: {report.listing.id} · seller: {report.listing.seller?.username ? `@${report.listing.seller.username}` : report.listing.seller?.telegramId || "-"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      reporter: {report.reporter.username ? `@${report.reporter.username}` : report.reporter.telegramId} · {formatDate(report.createdAt)}
                    </p>
                    <p className="mt-2 text-sm text-neutral-200">{report.reason}</p>
                    {report.adminNote ? <p className="mt-2 text-xs text-neutral-500">Note: {report.adminNote}</p> : null}

                    {report.status === "OPEN" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="rounded-full border border-emerald-400/70 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-300"
                          onClick={() => updateReport(report.id, "RESOLVE")}
                        >
                          Resolve
                        </button>
                        <button
                          className="rounded-full border border-amber-400/70 px-3 py-1 text-xs text-amber-200 hover:border-amber-300"
                          onClick={() => updateReport(report.id, "REJECT")}
                        >
                          Reject
                        </button>
                        <button
                          className="rounded-full border border-red-400/70 px-3 py-1 text-xs text-red-200 hover:border-red-300"
                          onClick={() => updateReport(report.id, "HIDE_LISTING")}
                        >
                          Hide listing
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="text-sm text-neutral-500">Жалоб нет.</p>
              )}
            </div>
          </section>
        ) : null}

        {canUseAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Споры / эскроу</h3>
              <button
                className="rounded-full border border-neutral-700 px-3 py-2 text-xs hover:border-white"
                onClick={loadDisputes}
              >
                Обновить
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {disputes.length ? (
                disputes.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <span className="rounded-full border border-neutral-700 px-2 py-1 text-[11px] uppercase tracking-wider">
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">listing: {item.id}</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      buyer: {item.buyer?.username ? `@${item.buyer.username}` : item.buyer?.telegramId || "-"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      seller: {item.seller?.username ? `@${item.seller.username}` : item.seller?.telegramId || "-"}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      hold: {item.holdAmount ?? 0} TC · fee: {item.feeAmount ?? 0} TC
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">
                      reservedAt: {formatDate(item.reservedAt)} · expiresAt: {formatDate(item.reservationExpiresAt)}
                    </p>
                    {item.disputeReason ? <p className="mt-2 text-sm text-neutral-200">{item.disputeReason}</p> : null}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-emerald-400/70 px-3 py-1 text-xs text-emerald-200 hover:border-emerald-300"
                        onClick={() => resolveDispute(item.id, "RELEASE")}
                      >
                        Release to seller
                      </button>
                      <button
                        className="rounded-full border border-amber-400/70 px-3 py-1 text-xs text-amber-200 hover:border-amber-300"
                        onClick={() => resolveDispute(item.id, "REFUND")}
                      >
                        Refund buyer
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-neutral-500">Активных споров/эскроу нет.</p>
              )}
            </div>
          </section>
        ) : null}

        {canUseAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <h3 className="text-lg font-semibold">Текущий каталог</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {catalog.map((game) => (
                <div key={game.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <h4 className="text-sm font-semibold">{game.name}</h4>
                  <p className="mt-2 text-xs text-neutral-400">
                    Серверов: {game.servers.length} · Категорий: {game.categories.length} · Тегов: {game.tags.length}
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
        ) : null}
      </div>
    </div>
  );
}
