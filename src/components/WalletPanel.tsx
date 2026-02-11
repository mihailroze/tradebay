"use client";

import { useEffect, useState, useCallback } from "react";

type Props = {
  initData: string;
  isAuthed: boolean;
};

type WalletResponse = {
  balance: number;
  lockedBalance?: number;
  currency: string;
};

type TelegramWebApp = {
  openInvoice?: (url: string, cb?: (status: string) => void) => void;
  openTelegramLink?: (url: string) => void;
};

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return tg?.WebApp ?? null;
}

export default function WalletPanel({ initData, isAuthed }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [lockedBalance, setLockedBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState("100");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadWallet = useCallback(() => {
    if (!isAuthed) return;
    fetch("/api/wallet", {
      headers: initData ? { "x-telegram-init-data": initData } : undefined,
    })
      .then((res) => res.json())
      .then((data: WalletResponse) => {
        setBalance(Number(data.balance ?? 0));
        setLockedBalance(Number(data.lockedBalance ?? 0));
      })
      .catch(() => {
        setBalance(null);
        setLockedBalance(null);
      });
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
      setStatus("Нужно войти через Telegram");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      setStatus("Введите целое число");
      return;
    }
    setLoading(true);
    setStatus("Создаем инвойс...");

    try {
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
        setStatus(data.error || "Пополнение не удалось");
        return;
      }

      const invoiceUrl = typeof data.url === "string" ? data.url : "";
      if (!invoiceUrl) {
        setStatus("Инвойс не создан. Повторите попытку.");
        return;
      }

      const tg = getTelegramWebApp();
      if (tg?.openInvoice) {
        try {
          tg.openInvoice(invoiceUrl, (result) => {
            setStatus(`Статус инвойса: ${result}`);
            if (result === "paid" || result === "pending") {
              setTimeout(loadWallet, 1500);
              if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("wallet:refresh"));
              }
            }
          });
        } catch {
          if (tg.openTelegramLink) {
            tg.openTelegramLink(invoiceUrl);
          } else if (typeof window !== "undefined") {
            window.location.href = invoiceUrl;
          }
          setStatus("Откройте инвойс в Telegram для оплаты");
        }
      } else if (tg?.openTelegramLink) {
        tg.openTelegramLink(invoiceUrl);
        setStatus("Откройте инвойс в Telegram для оплаты");
      } else if (typeof window !== "undefined") {
        window.location.href = invoiceUrl;
        setStatus("Откройте инвойс в Telegram для оплаты");
      }
    } catch (error) {
      setStatus(error instanceof Error ? `Ошибка: ${error.message}` : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthed) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300">
      <span className="text-neutral-400">TC</span>
      <span className="font-semibold text-neutral-100">{balance ?? "..."}</span>
      {lockedBalance ? <span className="text-neutral-500">Заморожено: {lockedBalance}</span> : null}
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-20 rounded-full border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 outline-none"
        placeholder="Сумма"
        inputMode="numeric"
      />
      <button
        className="rounded-full border border-neutral-700 px-3 py-1 text-xs hover:border-white"
        onClick={startTopUp}
        disabled={loading}
      >
        {loading ? "Создаем..." : "Пополнить"}
      </button>
      {status ? <span className="text-neutral-500">{status}</span> : null}
    </div>
  );
}
