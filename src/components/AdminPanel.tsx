"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TopNav from "@/components/TopNav";

type Game = { id: string; name: string; servers: { id: string; name: string }[]; categories: { id: string; name: string }[]; tags: { id: string; name: string }[] };
type CatalogResponse = { games: Game[] };
type AuthInfo = { ok: boolean; isAdmin?: boolean; error?: string; user?: { id: number } };
type Report = {
  id: string;
  reason: string;
  status: "OPEN" | "RESOLVED" | "REJECTED";
  createdAt: string;
  listing: { id: string; title: string };
  reporter: { telegramId: string; username: string | null };
};
type ReportsResponse = { reports: Report[] };
type Dispute = {
  id: string;
  title: string;
  status: string;
  disputedAt: string | null;
  reservationExpiresAt: string | null;
  slaDeadlineAt: string | null;
  overdue: boolean;
  holdAmount: number | null;
  feeAmount: number | null;
  buyer: { telegramId: string; username: string | null } | null;
  seller: { telegramId: string; username: string | null } | null;
  disputeCase: {
    status: string;
    events: Array<{ id: string; type: string; note: string | null; createdAt: string }>;
  } | null;
};
type DisputesResponse = { disputes: Dispute[]; disputeSlaHours: number };
type Reconcile = {
  stale: boolean;
  maxDelayMinutes: number;
  stats24h: { runs: number; failedRuns: number; processed: number };
  lastRun: { startedAt: string; status: string; processed: number } | null;
};
type Finance = {
  totals: {
    totalBalance: number;
    totalLocked: number;
    expectedSupplyFromTopups: number;
    actualSupply: number;
    supplyDiff: number;
    openDisputes: number;
  };
  byDay: Array<{ day: string; type: string; status: string; count: number; amount: number }>;
};

function getInitData() {
  if (typeof window === "undefined") return "";
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } }).Telegram;
  tg?.WebApp?.ready?.();
  return tg?.WebApp?.initData || window.sessionStorage.getItem("tg_init_data") || "";
}
function formatDate(v: string | null | undefined) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ru-RU");
}
function toPrettyAmount(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("ru-RU");
}

export default function AdminPanel() {
  const [initData, setInitData] = useState("");
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [status, setStatus] = useState("");
  const [catalog, setCatalog] = useState<Game[]>([]);
  const [reportFilter, setReportFilter] = useState<"OPEN" | "RESOLVED" | "REJECTED" | "ALL">("OPEN");
  const [reports, setReports] = useState<Report[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [disputeSlaHours, setDisputeSlaHours] = useState(24);
  const [reconcile, setReconcile] = useState<Reconcile | null>(null);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [financeDays, setFinanceDays] = useState("30");
  const [batchSize, setBatchSize] = useState("100");

  const [gameName, setGameName] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverGameId, setServerGameId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryGameId, setCategoryGameId] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagGameId, setTagGameId] = useState("");

  useEffect(() => {
    let retries = 0;
    const read = () => {
      const v = getInitData();
      if (v) {
        setInitData(v);
        window.sessionStorage.setItem("tg_init_data", v);
        return;
      }
      if (retries < 12) {
        retries += 1;
        setTimeout(read, 300);
      }
    };
    read();
  }, []);

  const headers = useMemo(() => (initData ? { "x-telegram-init-data": initData } : undefined), [initData]);
  const canAdmin = Boolean(auth?.ok && auth.isAdmin);

  const loadCatalog = useCallback(() => {
    fetch("/api/catalog").then((r) => r.json()).then((d: CatalogResponse) => setCatalog(d.games || [])).catch(() => setCatalog([]));
  }, []);
  const loadReports = useCallback(() => {
    const q = reportFilter === "ALL" ? "" : `?status=${reportFilter}`;
    fetch(`/api/admin/reports${q}`, { headers }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: ReportsResponse) => setReports(d.reports || [])).catch(() => setReports([]));
  }, [headers, reportFilter]);
  const loadDisputes = useCallback(() => {
    fetch("/api/admin/disputes", { headers }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d: DisputesResponse) => {
      setDisputes(d.disputes || []);
      setDisputeSlaHours(d.disputeSlaHours || 24);
    }).catch(() => setDisputes([]));
  }, [headers]);
  const loadOps = useCallback(() => {
    fetch("/api/admin/ops/reconcile", { headers }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setReconcile(d)).catch(() => setReconcile(null));
  }, [headers]);
  const loadFinance = useCallback(() => {
    const days = Math.max(1, Math.min(90, Number(financeDays) || 30));
    fetch(`/api/admin/finance/summary?days=${days}`, { headers }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => setFinance(d.summary || null)).catch(() => setFinance(null));
  }, [headers, financeDays]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);
  useEffect(() => {
    fetch("/api/auth/me", { headers }).then((r) => r.json()).then((d: AuthInfo) => setAuth(d)).catch(() => setAuth({ ok: false, error: "auth_failed" }));
  }, [headers]);
  useEffect(() => {
    if (!canAdmin) return;
    loadReports();
    loadDisputes();
    loadOps();
    loadFinance();
  }, [canAdmin, loadReports, loadDisputes, loadOps, loadFinance]);

  const createEntity = async (url: string, payload: Record<string, unknown>) => {
    setStatus("Сохраняем...");
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) }, body: JSON.stringify(payload) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      setStatus(`Ошибка: ${String((e as { error?: string }).error || r.statusText)}`);
      return;
    }
    setStatus("Готово");
    loadCatalog();
  };
  const patchReport = async (reportId: string, action: "RESOLVE" | "REJECT" | "HIDE_LISTING") => {
    const adminNote = window.prompt("Комментарий:", "") || undefined;
    const r = await fetch("/api/admin/reports", { method: "PATCH", headers: { "Content-Type": "application/json", ...(headers || {}) }, body: JSON.stringify({ reportId, action, adminNote }) });
    setStatus(r.ok ? "Жалоба обновлена" : "Ошибка обновления жалобы");
    loadReports();
  };
  const disputeAction = async (listingId: string, action: "SET_IN_REVIEW" | "RELEASE" | "REFUND") => {
    const note = window.prompt("Комментарий:", "") || undefined;
    const template = (window.prompt("Шаблон (OTHER/ITEM_NOT_DELIVERED/...):", "OTHER") || "OTHER").toUpperCase();
    const r = await fetch(`/api/admin/disputes/${listingId}`, { method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) }, body: JSON.stringify({ action, note, template }) });
    setStatus(r.ok ? "Спор обработан" : "Ошибка обработки спора");
    loadDisputes();
    loadFinance();
  };
  const runReconcile = async () => {
    const batch = Math.max(1, Math.min(500, Number(batchSize) || 100));
    const r = await fetch("/api/admin/ops/reconcile", { method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) }, body: JSON.stringify({ batchSize: batch }) });
    const d = await r.json().catch(() => ({}));
    setStatus(r.ok ? `Reconcile: ${String((d as { processed?: number }).processed || 0)}` : "Ошибка reconcile");
    loadOps();
    loadDisputes();
    loadFinance();
  };

  const selectedCategoryGame = catalog.find((g) => g.id === categoryGameId);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10">
        <TopNav />
        <header>
          <h2 className="text-2xl font-semibold tracking-tight">Админ-панель</h2>
          <p className="text-xs text-neutral-400">{auth?.ok ? `TG ID: ${auth.user?.id} · Admin: ${auth.isAdmin ? "yes" : "no"}` : `Auth: ${auth?.error || "-"}`}</p>
          <p className="text-xs text-neutral-500">{status}</p>
        </header>

        {!canAdmin ? <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-amber-300">Откройте страницу из Telegram Web App под админом.</section> : null}

        {canAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Ops / Reconcile</h3>
              <button className="rounded-full border border-neutral-700 px-3 py-2 text-xs hover:border-white" onClick={loadOps}>Обновить</button>
            </div>
            {reconcile ? (
              <>
                <p className="mt-2 text-xs text-neutral-300">Stale: {String(reconcile.stale)} · Max delay: {reconcile.maxDelayMinutes}m · Last run: {formatDate(reconcile.lastRun?.startedAt)} · Last status: {reconcile.lastRun?.status || "-"}</p>
                <p className="mt-1 text-xs text-neutral-400">24h: runs {reconcile.stats24h.runs}, failed {reconcile.stats24h.failedRuns}, processed {reconcile.stats24h.processed}</p>
              </>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <input value={batchSize} onChange={(e) => setBatchSize(e.target.value)} className="w-24 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs outline-none focus:border-neutral-500" />
              <button className="rounded-full border border-emerald-500/70 px-3 py-2 text-xs text-emerald-200 hover:border-emerald-300" onClick={runReconcile}>Запустить reconcile</button>
            </div>
          </section>
        ) : null}

        {canAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Finance</h3>
              <div className="flex items-center gap-2">
                <input value={financeDays} onChange={(e) => setFinanceDays(e.target.value)} className="w-16 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs outline-none focus:border-neutral-500" />
                <button className="rounded-full border border-neutral-700 px-3 py-2 text-xs hover:border-white" onClick={loadFinance}>Обновить</button>
              </div>
            </div>
            {finance ? (
              <>
                <p className="mt-2 text-xs text-neutral-300">Balance: {toPrettyAmount(finance.totals.totalBalance)} · Locked: {toPrettyAmount(finance.totals.totalLocked)} · Expected: {toPrettyAmount(finance.totals.expectedSupplyFromTopups)} · Actual: {toPrettyAmount(finance.totals.actualSupply)} · Diff: {toPrettyAmount(finance.totals.supplyDiff)} · Open disputes: {finance.totals.openDisputes}</p>
                <div className="mt-3 max-h-52 overflow-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-xs">
                  {finance.byDay.slice(0, 40).map((row, idx) => (
                    <p key={`${row.day}-${row.type}-${idx}`} className="text-neutral-300">{row.day} · {row.type} · {row.status} · count {row.count} · amount {toPrettyAmount(row.amount)}</p>
                  ))}
                </div>
              </>
            ) : <p className="mt-2 text-xs text-neutral-500">Нет данных.</p>}
          </section>
        ) : null}

        {canAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Жалобы</h3>
              <div className="flex gap-2">
                <select value={reportFilter} onChange={(e) => setReportFilter(e.target.value as "OPEN" | "RESOLVED" | "REJECTED" | "ALL")} className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs">
                  <option value="OPEN">OPEN</option><option value="RESOLVED">RESOLVED</option><option value="REJECTED">REJECTED</option><option value="ALL">ALL</option>
                </select>
                <button className="rounded-full border border-neutral-700 px-3 py-2 text-xs hover:border-white" onClick={loadReports}>Обновить</button>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              {reports.map((r) => (
                <article key={r.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-xs text-neutral-400">{r.listing.title} · {r.status} · {formatDate(r.createdAt)} · {r.reporter.username ? `@${r.reporter.username}` : r.reporter.telegramId}</p>
                  <p className="mt-1 text-sm">{r.reason}</p>
                  {r.status === "OPEN" ? (
                    <div className="mt-2 flex gap-2">
                      <button className="rounded-full border border-emerald-400/70 px-3 py-1 text-xs text-emerald-200" onClick={() => patchReport(r.id, "RESOLVE")}>Resolve</button>
                      <button className="rounded-full border border-amber-400/70 px-3 py-1 text-xs text-amber-200" onClick={() => patchReport(r.id, "REJECT")}>Reject</button>
                      <button className="rounded-full border border-red-400/70 px-3 py-1 text-xs text-red-200" onClick={() => patchReport(r.id, "HIDE_LISTING")}>Hide</button>
                    </div>
                  ) : null}
                </article>
              ))}
              {!reports.length ? <p className="text-xs text-neutral-500">Жалоб нет.</p> : null}
            </div>
          </section>
        ) : null}

        {canAdmin ? (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Споры / Escrow (SLA {disputeSlaHours}h)</h3>
              <button className="rounded-full border border-neutral-700 px-3 py-2 text-xs hover:border-white" onClick={loadDisputes}>Обновить</button>
            </div>
            <div className="mt-3 grid gap-2">
              {disputes.map((d) => (
                <article key={d.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-xs text-neutral-400">{d.title} · {d.status} · deadline {formatDate(d.slaDeadlineAt)} · overdue {String(d.overdue)} · hold {d.holdAmount ?? 0} · fee {d.feeAmount ?? 0}</p>
                  <p className="mt-1 text-xs text-neutral-500">buyer {d.buyer?.username ? `@${d.buyer.username}` : d.buyer?.telegramId || "-"} · seller {d.seller?.username ? `@${d.seller.username}` : d.seller?.telegramId || "-"}</p>
                  {d.disputeCase?.events?.length ? (
                    <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-xs text-neutral-400">
                      {d.disputeCase.events.slice(0, 5).map((e) => <p key={e.id}>{e.type} · {formatDate(e.createdAt)} {e.note ? `· ${e.note}` : ""}</p>)}
                    </div>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-full border border-sky-400/70 px-3 py-1 text-xs text-sky-200" onClick={() => disputeAction(d.id, "SET_IN_REVIEW")}>В работу</button>
                    <button className="rounded-full border border-emerald-400/70 px-3 py-1 text-xs text-emerald-200" onClick={() => disputeAction(d.id, "RELEASE")}>Release</button>
                    <button className="rounded-full border border-amber-400/70 px-3 py-1 text-xs text-amber-200" onClick={() => disputeAction(d.id, "REFUND")}>Refund</button>
                  </div>
                </article>
              ))}
              {!disputes.length ? <p className="text-xs text-neutral-500">Споров нет.</p> : null}
            </div>
          </section>
        ) : null}

        {canAdmin ? (
          <section className="grid gap-4 md:grid-cols-2">
            <form onSubmit={(e) => { e.preventDefault(); if (!gameName.trim()) return; createEntity("/api/admin/games", { name: gameName.trim() }); setGameName(""); }} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="text-sm font-semibold">Игра</h3>
              <input value={gameName} onChange={(e) => setGameName(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" placeholder="Название" required />
              <button className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); if (!serverName.trim() || !serverGameId) return; createEntity("/api/admin/servers", { name: serverName.trim(), gameId: serverGameId }); setServerName(""); }} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="text-sm font-semibold">Сервер</h3>
              <select value={serverGameId} onChange={(e) => setServerGameId(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" required>
                <option value="">Игра</option>{catalog.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input value={serverName} onChange={(e) => setServerName(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" placeholder="Название" required />
              <button className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); if (!categoryName.trim() || !categoryGameId) return; createEntity("/api/admin/categories", { name: categoryName.trim(), gameId: categoryGameId, parentId: null }); setCategoryName(""); }} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="text-sm font-semibold">Категория</h3>
              <select value={categoryGameId} onChange={(e) => setCategoryGameId(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" required>
                <option value="">Игра</option>{catalog.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" placeholder="Название" required />
              <p className="mt-1 text-xs text-neutral-500">Категории текущей игры: {(selectedCategoryGame?.categories || []).map((c) => c.name).slice(0, 5).join(", ") || "-"}</p>
              <button className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); if (!tagName.trim() || !tagGameId) return; createEntity("/api/admin/tags", { name: tagName.trim(), gameId: tagGameId }); setTagName(""); }} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="text-sm font-semibold">Тег</h3>
              <select value={tagGameId} onChange={(e) => setTagGameId(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" required>
                <option value="">Игра</option>{catalog.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input value={tagName} onChange={(e) => setTagName(e.target.value)} className="mt-2 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm" placeholder="Название" required />
              <button className="mt-3 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black">Добавить</button>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
