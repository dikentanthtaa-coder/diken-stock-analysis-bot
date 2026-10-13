"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./brand";

type Item = { href: string; label: string; icon: keyof typeof ICONS; hint: string };

const NAV: Item[] = [
  { href: "/", label: "Dashboard", icon: "home", hint: "Overview, charts & history" },
  { href: "/research", label: "Research", icon: "search", hint: "Analyze a stock" },
  { href: "/planner", label: "Planner", icon: "calc", hint: "Size a trade" },
  { href: "/learning", label: "Learning", icon: "play", hint: "Course transcripts" },
  { href: "/knowledge", label: "Knowledge", icon: "book", hint: "Concepts & rules" },
  { href: "/backtest", label: "Backtest", icon: "flask", hint: "Test a strategy" },
  { href: "/paper", label: "Paper", icon: "note", hint: "Paper trades" },
  { href: "/journal", label: "Journal", icon: "journal", hint: "Thesis vs result" },
  { href: "/activity", label: "Activity", icon: "clock", hint: "Last 7 days" },
  { href: "/settings", label: "Settings", icon: "cog", hint: "Keys & status" },
];

// Bottom bar on phones: four primary pages + "More".
const BOTTOM: Item[] = [NAV[0], NAV[1], NAV[2], NAV[6]];

const ICONS = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h14V10",
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm10.5 3-5.2-5.2",
  calc: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 4h8M8 12h3m5 0h0M8 16h3m5 0h0",
  play: "M5 4.5v15l14-7.5-14-7.5Z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13",
  flask: "M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3",
  note: "M7 3h7l5 5v13H7V3Zm7 0v5h5M9.5 13h5m-5 4h5",
  journal: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm3 0v16M12 9h4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  cog: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.9-1.4-2-3.5-1.6.5a7 7 0 0 0-1.7-1l-.3-1.7h-4l-.3 1.7a7 7 0 0 0-1.7 1L7 8.5l-2 3.5.9 1.4a7 7 0 0 0 0 2l-.9 1.4 2 3.5 1.6-.5a7 7 0 0 0 1.7 1l.3 1.7h4l.3-1.7a7 7 0 0 0 1.7-1l1.6.5 2-3.5-.9-1.4a7 7 0 0 0 0-2Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
} as const;

function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the sheet when the route changes (state-from-props pattern, no effect).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  // Lock page scroll while the sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center justify-between py-2 sm:py-2.5">
            <Link href="/" aria-label="Stock Pilot home" className="min-w-0">
              <Brand withTagline />
            </Link>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 md:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                EOD data · research only
              </span>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="mobile-menu"
                aria-label={open ? "Close menu" : "Open menu"}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 md:hidden"
              >
                <Icon name={open ? "close" : "menu"} className="h-6 w-6" />
              </button>
            </div>
          </div>
          {/* Desktop / tablet tab bar */}
          <nav className="no-scrollbar -mb-px hidden gap-1 overflow-x-auto text-sm md:flex">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
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

      {/* Mobile menu sheet */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" id="mobile-menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300" />
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-400">All pages</p>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
                        active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-800 active:bg-zinc-50"
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600"}`}>
                        <Icon name={item.icon} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="block truncate text-[11px] text-zinc-500">{item.hint}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-center text-[11px] text-zinc-400">End-of-day data · research only · no orders placed</p>
          </div>
        </div>
      )}

      {/* Bottom tab bar (phones) */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {BOTTOM.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-indigo-600" : "text-zinc-500"}`}
                >
                  <Icon name={item.icon} className={`h-5 w-5 ${active ? "stroke-[2.2]" : ""}`} />
                  <span className={active ? "font-medium" : ""}>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] ${open ? "text-indigo-600" : "text-zinc-500"}`}
            >
              <Icon name="menu" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
