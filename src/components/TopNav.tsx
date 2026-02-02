"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Рынок" },
  { href: "/my", label: "Мои лоты" },
  { href: "/admin", label: "Админка" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-neutral-800 bg-neutral-900 px-5 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">TradeBay</p>
        <h1 className="text-lg font-semibold tracking-tight">Игровой рынок</h1>
      </div>
      <div className="flex flex-wrap gap-2">
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
      </div>
    </nav>
  );
}
