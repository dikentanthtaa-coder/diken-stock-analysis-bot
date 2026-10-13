import Link from "next/link";

export function StrategyTabs({ active }: { active: "breakout" | "signal" }) {
  const tab = (key: "breakout" | "signal", label: string, href: string) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${active === key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
      aria-current={active === key ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <div className="mt-5 inline-flex rounded-xl border border-zinc-300 bg-white p-1 shadow-sm">
      {tab("breakout", "Breakout + volume (EOD)", "/backtest")}
      {tab("signal", "Signal engine (any timeframe)", "/backtest?strategy=signal")}
    </div>
  );
}
