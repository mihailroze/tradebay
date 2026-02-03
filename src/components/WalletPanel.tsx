"use client";

import { useEffect, useState, useCallback } from "react";

type Props = {
  initData: string;
  isAuthed: boolean;
};

type WalletResponse = {
  balance: number;
  currency: string;
};

type TelegramWebApp = {
  openInvoice?: (url: string, cb?: (status: string) => void) => void;
};

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return tg?.WebApp ?? null;
}

export default function WalletPanel({ initData, isAuthed }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadWallet = useCallback(() => {
    if (!isAuthed) return;
    fetch("/api/wallet", {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: WalletResponse) => setBalance(Number(data.balance ?? 0)))
      .catch(() => setBalance(null));
  }, [initData, isAuthed]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => loadWallet();
    window.addEventListener("wallet:refresh", handler);
    return () => window.removeEventListener("wallet:refresh", handler);
  }, [loadWallet]);

  const startTopUp = async () => {
    if (!isAuthed) {
      setStatus("Login required");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      setStatus("Enter whole amount");
      return;
    }
    setLoading(true);
    setStatus("");
    const res = await fetch("/api/wallet/topup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(initData ? { "x-telegram-init-data": initData } : {}),
      },
      body: JSON.stringify({ amount: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setStatus(data.error || "Top-up failed");
      return;
    }

    const invoiceUrl = data.url as string;
    const tg = getTelegramWebApp();
    if (tg?.openInvoice) {
      tg.openInvoice(invoiceUrl, (result) => {
        setStatus(`Invoice: ${result}`);
        if (result === "paid" || result === "pending") {
          setTimeout(loadWallet, 1500);
        }
      });
    } else if (typeof window !== "undefined") {
      window.open(invoiceUrl, "_blank");
      setStatus("Open invoice in Telegram to pay");
    }
    setLoading(false);
  };

  if (!isAuthed) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
      <span className="text-neutral-400">TC</span>
      <span className="font-semibold text-neutral-100">{balance ?? "..."}</span>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-20 rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none"
        placeholder="Amount"
        inputMode="numeric"
      />
      <button
        className="rounded-full border border-neutral-700 px-3 py-1 text-xs hover:border-white"
        onClick={startTopUp}
        disabled={loading}
      >
        Top up
      </button>
      {status ? <span className="text-neutral-500">{status}</span> : null}
    </div>
  );
}
