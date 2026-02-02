"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onSuccess?: () => void;
};

export default function TelegramLogin({ onSuccess }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const raw = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "").trim();
    const username = raw.startsWith("@") ? raw.slice(1) : raw;
    if (!username) {
      setStatus("Укажите NEXT_PUBLIC_TELEGRAM_BOT_USERNAME");
      return;
    }

    (window as unknown as { onTelegramAuth?: (user: Record<string, unknown>) => void }).onTelegramAuth = async (user) => {
      setStatus("Авторизация...");
      const res = await fetch("/api/auth/telegram-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });
      if (!res.ok) {
        setStatus("Ошибка авторизации");
        return;
      }
      setStatus("Готово");
      onSuccess?.();
    };

    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", username);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-userpic", "false");
    containerRef.current.appendChild(script);

    return () => {
      delete (window as unknown as { onTelegramAuth?: unknown }).onTelegramAuth;
    };
  }, [onSuccess]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} />
      {status ? <p className="text-xs text-neutral-400">{status}</p> : null}
    </div>
  );
}
