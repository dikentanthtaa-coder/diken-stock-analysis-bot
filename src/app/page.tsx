import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageLoader } from "./loader";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <PageLoader label="Loading dashboard" />
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

const OUTCOME_SHORT: Record<string, string> = {
  PotentialBuySetup: "Buy setup?",
  WatchlistWait: "Wait",
  NoTrade: "No trade",
  InsufficientData: "No data",
  ReviewPosition: "Review",
};

async function DashboardContent() {
  const [recentAnalyses, setups, watchItems, counts] = await Promise.all([
    db.analysis.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { stock: true },
    }),
    db.analysis.findMany({
      where: { outcome: { in: ["PotentialBuySetup", "WatchlistWait"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { stock: true },
    }),
    db.watchlistItem.findMany({
      include: {
        stock: { include: { candles: { orderBy: { date: "desc" }, take: 2 } } },
      },
      orderBy: { addedAt: "desc" },
      take: 10,
    }),
    Promise.all([
      db.video.count({ where: { status: "Completed" } }),
      db.video.count(),
      db.concept.count(),
      db.strategyRule.count(),
      db.paperTrade.count(),
    ]),
  ]);
  const [videosDone, videosTotal, conceptCount, ruleCount, paperCount] = counts;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-6 text-white shadow-md sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-indigo-100">
          Research overview · all market data is end-of-day, never real-time.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/research"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
          >
            Analyze a stock →
          </Link>
          <Link
            href="/planner"
            className="rounded-lg border border-white/50 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/20"
          >
            Plan a trade
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          [`${videosDone}/${videosTotal}`, "transcripts processed", "/learning", "bg-indigo-500"],
          [`${conceptCount}`, "concept entries", "/knowledge", "bg-emerald-500"],
          [`${ruleCount}`, "strategy rules", "/knowledge", "bg-amber-500"],
          [`${paperCount}`, "paper trades", "/paper", "bg-sky-500"],
        ].map(([v, label, href, bar], i) => (
          <Link
            key={i}
            href={href as string}
            className="group relative overflow-hidden rounded-lg border border-zinc-200 p-4 transition-shadow hover:shadow-md"
          >
            <span className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
            <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
              {v}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
              {label}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 md:gap-6">
        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="font-medium text-zinc-900">Watchlist</h2>
          {watchItems.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              Empty. Add stocks from the{" "}
              <Link href="/research" className="underline">
                Research
              </Link>{" "}
              page.
            </p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {watchItems.map((i) => {
                  const [last, prev] = i.stock.candles;
                  const chg =
                    last && prev
                      ? ((last.close - prev.close) / prev.close) * 100
                      : null;
                  return (
                    <tr key={i.id}>
                      <td className="py-2 font-medium">{i.stock.symbol}</td>
                      <td className="py-2 text-zinc-500">{i.stock.exchange}</td>
                      <td className="py-2 text-right">
                        {last ? `₹${last.close.toFixed(2)}` : "—"}
                      </td>
                      <td
                        className={`py-2 text-right ${
                          chg == null
                            ? "text-zinc-400"
                            : chg >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                        }`}
                      >
                        {chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                      </td>
                      <td className="py-2 text-right text-xs text-zinc-400">
                        {last ? last.date.toISOString().slice(0, 10) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 p-4">
          <h2 className="font-medium text-zinc-900">Setups needing review</h2>
          {setups.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">
              None yet. Run analyses from the Research page.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {setups.map((a) => (
                <li key={a.id} className="rounded-md border border-zinc-200 p-3">
                  <span className="font-medium">{a.stock.symbol}</span>
                  <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                    {OUTCOME_SHORT[a.outcome]}
                  </span>
                  <span className="ml-2 text-xs text-zinc-400">
                    as of {a.asOfDate.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="font-medium text-zinc-900">Recently analyzed</h2>
        {recentAnalyses.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No analyses yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {recentAnalyses.map((a) => (
              <span
                key={a.id}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600"
              >
                {a.stock.symbol} · {OUTCOME_SHORT[a.outcome]} ·{" "}
                {a.createdAt.toISOString().slice(0, 10)}
              </span>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
