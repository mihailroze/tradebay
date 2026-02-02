"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onSuccess?: () => void;
};

export default function TelegramLogin({ onSuccess }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status] = useState("");

  useEffect(() => {
    const raw = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").trim();
    const username = raw.startsWith("@") ? raw.slice(1) : raw;
    if (!username) {
      setStatus("Укажите NEXT_PUBLIC_TELEGRAM_BOT_USERNAME");
      return;
    }

    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const authUrl = new URL("/api/auth/telegram-login", window.location.origin);
    authUrl.searchParams.set("return_to", window.location.href);
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", username);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", authUrl.toString());
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-userpic", "false");
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [onSuccess]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} />
      {status ? <p className="text-xs text-neutral-400">{status}</p> : null}
    </div>
  );
}
