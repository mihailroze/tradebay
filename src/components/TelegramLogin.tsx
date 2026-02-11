"use client";

import { useEffect, useRef } from "react";
import { normalizeEnvValue } from "@/lib/env";

type Props = {
  onSuccess?: () => void;
};

export default function TelegramLogin({ onSuccess }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const raw = normalizeEnvValue(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME);
  const username = raw.startsWith("@") ? raw.slice(1) : raw;
  const status = username ? "" : "Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME";

  void onSuccess;

  useEffect(() => {
    if (!username) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    const baseUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SITE_URL) || window.location.origin;
    const authUrl = new URL("/api/auth/telegram-login", baseUrl);
    const returnTo = new URL(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      baseUrl,
    );
    authUrl.searchParams.set("return_to", returnTo.toString());
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", username);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", authUrl.toString());
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-userpic", "false");
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [username]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} />
      {status ? <p className="text-xs text-neutral-400">{status}</p> : null}
    </div>
  );
}
