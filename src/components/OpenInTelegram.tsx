"use client";

import { useEffect, useState } from "react";

type Props = {
  listingId: string;
};

function buildStartAppLink(listingId: string): string {
  const raw = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").trim();
  const username = raw.startsWith("@") ? raw.slice(1) : raw;
  if (!username) return "";
  const payload = `l_${listingId}`;
  return `https://t.me/${username}?startapp=${encodeURIComponent(payload)}`;
}

export default function OpenInTelegram({ listingId }: Props) {
  const [link, setLink] = useState("");
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    setLink(buildStartAppLink(listingId));
  }, [listingId]);

  useEffect(() => {
    if (!link) return;
    const tgWebApp = (window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram?.WebApp;
    if (tgWebApp) return;
    const ua = navigator.userAgent || "";
    const isTelegram = /Telegram/i.test(ua);
    if (isTelegram) {
      window.location.href = link;
      return;
    }
    setShowButton(true);
  }, [link]);

  if (!link || !showButton) return null;

  return (
    <a
      href={link}
      className="inline-flex items-center justify-center rounded-full border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-200 hover:border-white"
    >
      Открыть в Telegram
    </a>
  );
}
