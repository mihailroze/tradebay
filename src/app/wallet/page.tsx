"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import WalletPanel from "@/components/WalletPanel";

type Transaction = {
  id: string;
  type: string;
  status: string;
  amount: number;
  listingId?: string | null;
  createdAt: string;
};

type WalletResponse = {
  balance?: number;
  lockedBalance?: number;
  transactions?: Transaction[];
};

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

function formatAmount(amount: number) {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${amount} TC`;
}

function formatType(type: string) {
  switch (type) {
    case "TOP_UP":
      return "Пополнение";
    case "PURCHASE":
      return "Покупка";
    case "SALE":
      return "Продажа";
    case "REFUND":
      return "Возврат";
    case "FEE":
      return "Комиссия";
    default:
      return type;
  }
}

function formatStatus(status: string) {
  switch (status) {
    case "PENDING":
      return "В ожидании";
    case "COMPLETED":
      return "Завершено";
    case "FAILED":
      return "Ошибка";
    default:
      return status;
  }
}

export default function WalletPage() {
  const [initData, setInitData] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [lockedBalance, setLockedBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let attempts = 0;
    const read = () => {
      const value = getInitData();
      if (value) {
        setInitData(value);
        return;
      }
      if (attempts < 6) {
        attempts += 1;
        setTimeout(read, 300);
      }
    };
    read();
  }, []);

  useEffect(() => {
    const headers = initData ? { "x-telegram-init-data": initData } : undefined;
    fetch("/api/auth/me", { headers })
      .then((res) => res.json())
      .then((data: { ok?: boolean }) => setIsAuthed(Boolean(data.ok)))
      .catch(() => setIsAuthed(false));
  }, [initData]);

  const loadWallet = () => {
    if (!initData && !isAuthed) return;
    fetch("/api/wallet", {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: WalletResponse) => {
        setBalance(Number(data.balance ?? 0));
        setLockedBalance(Number(data.lockedBalance ?? 0));
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      })
      .catch(() => {
        setBalance(null);
        setLockedBalance(null);
        setTransactions([]);
        setStatus("Не удалось загрузить кошелек.");
      });
  };

  useEffect(() => {
    loadWallet();
  }, [initData, isAuthed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => loadWallet();
    window.addEventListener("wallet:refresh", handler);
    return () => window.removeEventListener("wallet:refresh", handler);
  }, [initData, isAuthed]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10">
        <TopNav />
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Кошелек</h2>
          {balance !== null ? (
            <span className="text-sm text-neutral-300">
              Баланс: {balance} TC
              {lockedBalance ? <span className="ml-2 text-xs text-neutral-500">Заморожено: {lockedBalance} TC</span> : null}
            </span>
          ) : null}
        </header>

        {!initData && !isAuthed ? (
          <p className="text-sm text-amber-400">Войдите через Telegram, чтобы пользоваться кошельком.</p>
        ) : null}

        <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Trade Coin</p>
              <p className="text-sm text-neutral-300">Курс: 1 звезда = 1 TC</p>
            </div>
            <WalletPanel initData={initData} isAuthed={isAuthed} />
          </div>
          {status ? <p className="mt-3 text-xs text-neutral-500">{status}</p> : null}
        </div>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">История транзакций</h3>
            <span className="text-xs text-neutral-500">Последние 20</span>
          </div>
          {transactions.length ? (
            <div className="flex flex-col gap-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm">
                  <div className="flex flex-col">
                    <span className="text-neutral-100">{formatType(tx.type)}</span>
                    <span className="text-xs text-neutral-500">{new Date(tx.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-neutral-300">{formatStatus(tx.status)}</span>
                    {tx.listingId ? (
                      <Link className="text-xs text-amber-400 hover:text-amber-200" href={`/?listingId=${tx.listingId}`}>
                        Лот
                      </Link>
                    ) : null}
                    <span className={`text-sm ${tx.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {formatAmount(tx.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">Пока нет транзакций.</p>
          )}
        </section>
      </div>
    </div>
  );
}
