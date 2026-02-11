"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import TelegramLogin from "@/components/TelegramLogin";
import WalletPanel from "@/components/WalletPanel";

const baseLinks = [
  { href: "/", label: "Рынок" },
  { href: "/my", label: "Мои лоты" },
  { href: "/purchases", label: "Мои покупки" },
  { href: "/favorites", label: "Избранное" },
  { href: "/wallet", label: "Кошелек" },
];

const legalLinks = [
  { href: "/terms", label: "Условия" },
  { href: "/privacy", label: "Конфиденциальность" },
];

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

export default function TopNav() {
  const pathname = usePathname();
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV || "production").trim().toLowerCase();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [authSource, setAuthSource] = useState<"webapp" | "session" | "">("");
  const [authUser, setAuthUser] = useState<{ username?: string | null; firstName?: string | null; lastName?: string | null } | null>(
    null,
  );
  const [initData, setInitData] = useState("");
  const [authTick, setAuthTick] = useState(0);

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
    const headers = initData ? { "x-telegram-init-data": initData } : undefined;
    fetch("/api/auth/me", { headers })
      .then((res) => res.json())
      .then((data: { ok?: boolean; isAdmin?: boolean; source?: "webapp" | "session"; user?: { username?: string | null; firstName?: string | null; lastName?: string | null } }) => {
        setIsAdmin(Boolean(data.isAdmin));
        setIsAuthed(Boolean(data.ok));
        setAuthSource(data.source ?? "");
        setAuthUser(data.user ?? null);
      })
      .catch(() => {
        setIsAdmin(false);
        setIsAuthed(false);
        setAuthSource("");
        setAuthUser(null);
      });
  }, [initData, authTick]);

  const links = isAdmin ? [...baseLinks, { href: "/admin", label: "Админка" }] : baseLinks;

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-neutral-800 bg-neutral-900 px-5 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">TradeBay</p>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Игровой рынок</h1>
          {appEnv !== "production" ? (
            <span className="rounded-full border border-amber-400/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
              {appEnv}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          {legalLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-neutral-800 px-2 py-1 text-[11px] text-neutral-500 hover:border-neutral-500 hover:text-neutral-300"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                active ? "border-white text-white" : "border-neutral-700 text-neutral-300 hover:border-white"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        {isAuthed ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>
              Вы вошли как{" "}
              <span className="text-neutral-200">
                {authUser?.username
                  ? `@${authUser.username}`
                  : [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ") || "пользователь"}
              </span>
            </span>
            {authSource === "session" ? (
              <button
                className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:border-white"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  setAuthTick((v) => v + 1);
                }}
              >
                Выйти
              </button>
            ) : null}
          </div>
        ) : null}
        <WalletPanel initData={initData} isAuthed={isAuthed} />
        {!initData && !isAuthed ? <TelegramLogin onSuccess={() => setAuthTick((v) => v + 1)} /> : null}
      </div>
    </nav>
  );
}
