"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/research", label: "Research" },
  { href: "/planner", label: "Planner" },
  { href: "/learning", label: "Learning" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/backtest", label: "Backtest" },
  { href: "/paper", label: "Paper" },
  { href: "/journal", label: "Journal" },
  { href: "/settings", label: "Settings" },
];

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between py-2.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-bold text-white shadow-sm">
              D
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
              Dkn Stock Research
            </span>
          </Link>
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            EOD data · research only
          </span>
        </div>
        {/* Scrollable tab bar: works on any screen width */}
        <nav className="no-scrollbar -mb-px flex gap-1 overflow-x-auto text-sm">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 transition-colors ${
                  active
                    ? "border-indigo-600 font-medium text-indigo-700"
                    : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
