import { Suspense } from "react";
import Link from "next/link";
import { PageLoader } from "./loader";
import { StackedColumns, LineChart, HBars } from "./charts";
import { SERIES_COLORS } from "./chart-colors";
import { ActivityList } from "./activity-list";
import { getDashboardData, ACTIVITY_SERIES, timeOfDay, dayKey, shortDay } from "@/server/dashboard";

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading dashboard" />}>
      <DashboardContent />
    </Suspense>
  );
}

const OUTCOME_STYLE: Record<string, string> = {
  PotentialBuySetup: "bg-emerald-100 text-emerald-800",
  WatchlistWait: "bg-blue-100 text-blue-800",
  NoTrade: "bg-zinc-100 text-zinc-700",
  InsufficientData: "bg-amber-100 text-amber-800",
  ReviewPosition: "bg-purple-100 text-purple-800",
};
const OUTCOME_COLOR: Record<string, string> = {
  PotentialBuySetup: SERIES_COLORS[2],
  WatchlistWait: SERIES_COLORS[0],
  NoTrade: "#a1a1aa",
  InsufficientData: SERIES_COLORS[3],
  ReviewPosition: SERIES_COLORS[5],
};
const VIDEO_COLOR: Record<string, string> = {
  Completed: SERIES_COLORS[2],
  Pending: "#a1a1aa",
  Processing: SERIES_COLORS[0],
  TranscriptUnavailable: SERIES_COLORS[3],
  Failed: SERIES_COLORS[1],
};

const inr = (v: number) => `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);
const num = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));

function Card({ title, sub, children, action }: { title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-zinc-900">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-zinc-500">{children}</p>;
}

async function DashboardContent() {
  const d = await getDashboardData();
  const c = d.counts;
  const activitySeries = ACTIVITY_SERIES.map((name, i) => ({ name, color: i === 5 ? "#a1a1aa" : SERIES_COLORS[i] }));
  const totalActivity30d = d.activity.reduce((s, b) => s + b.values.reduce((a, v) => a + v, 0), 0);

  const tiles: [string, string, string, string][] = [
    [`${c.analysisCount}`, "analyses run", "/research", "bg-indigo-500"],
    [`${c.searchCount}`, "searches", "/activity?kind=search", "bg-sky-500"],
    [`${c.backtestCount}`, "backtests", "/backtest", "bg-orange-500"],
    [`${c.paperCount}`, "paper trades", "/paper", "bg-amber-500"],
    [`${c.watchCount}`, "watchlist stocks", "/", "bg-teal-500"],
    [`${c.videosDone}/${c.videosTotal}`, "transcripts processed", "/learning", "bg-pink-500"],
    [`${c.conceptCount}`, "concept entries", "/knowledge", "bg-emerald-500"],
    [`${c.ruleCount}`, "strategy rules", "/knowledge", "bg-violet-500"],
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-6 text-white shadow-md sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-indigo-100">
              Everything you&apos;ve done in the app · all market data is end-of-day, never real-time.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold leading-none">{totalActivity30d}</p>
            <p className="mt-1 text-xs text-indigo-100">actions in the last 30 days</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/research" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50">
            Analyze a stock →
          </Link>
          <Link href="/planner" className="rounded-lg border border-white/50 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/20">
            Plan a trade
          </Link>
          <Link href="/activity" className="rounded-lg border border-white/50 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/20">
            Full activity history
          </Link>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {tiles.map(([v, label, href, bar]) => (
          <Link key={label} href={href} className="group relative overflow-hidden rounded-lg border border-zinc-200 p-4 transition-shadow hover:shadow-md">
            <span className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
            <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">{v}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
          </Link>
        ))}
      </div>

      {/* Activity over time */}
      <div className="mt-6">
        <Card title="Activity · last 30 days" sub="Searches, analyses, backtests, paper trades, transcript processing and other actions per day (IST).">
          <div className="mt-3">
            <StackedColumns data={d.activity} series={activitySeries} height={200} />
          </div>
        </Card>
      </div>

      {/* Outcomes + learning pipeline */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Analysis outcomes" sub={`${c.analysisCount} analyses · what the engine concluded`}>
          <HBars
            rows={d.outcomes.map((o) => ({ label: o.label, value: o.count, color: OUTCOME_COLOR[o.outcome] ?? "#a1a1aa" }))}
            emptyText="No analyses yet — run one from Research."
          />
        </Card>
        <Card title="Learning pipeline" sub={`${c.videosTotal} videos · ${c.transcriptCount} transcripts stored`}>
          <HBars
            rows={d.videoStatus.filter((v) => v.count > 0).map((v) => ({ label: v.status.replace(/([A-Z])/g, " $1").trim(), value: v.count, color: VIDEO_COLOR[v.status] ?? "#a1a1aa" }))}
            emptyText="No videos yet — sync playlists from Learning."
          />
        </Card>
      </div>

      {/* Knowledge growth */}
      <div className="mt-4">
        <Card title="Knowledge base growth" sub="Cumulative concepts and strategy rules extracted from transcripts.">
          <div className="mt-3">
            <LineChart
              data={d.growth}
              series={[
                { name: "Concepts", color: SERIES_COLORS[2] },
                { name: "Strategy rules", color: SERIES_COLORS[5] },
              ]}
              height={190}
              ariaLabel="Knowledge base growth"
            />
          </div>
        </Card>
      </div>

      {/* Paper trading + backtests */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Paper trading" sub="Hypothetical trades only · P&L uses last end-of-day close for open positions." action={<Link href="/paper" className="text-xs text-indigo-600 hover:underline">Open →</Link>}>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Open", `${d.paperStats.open}`],
              ["Closed", `${d.paperStats.closed}`],
              ["Win rate", pct(d.paperStats.winRate)],
              ["Avg R", num(d.paperStats.avgR)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-zinc-50 px-3 py-2">
                <p className="text-lg font-semibold tabular-nums text-zinc-900">{v}</p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">{k}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-zinc-500">
              Realized{" "}
              <b className={d.paperStats.realizedPnl >= 0 ? "text-emerald-700" : "text-red-700"}>{inr(d.paperStats.realizedPnl)}</b>
            </span>
            <span className="text-zinc-500">
              Unrealized{" "}
              <b className={d.paperStats.unrealizedPnl >= 0 ? "text-emerald-700" : "text-red-700"}>{inr(d.paperStats.unrealizedPnl)}</b>
            </span>
          </div>
          {d.trades.length === 0 ? (
            <Empty>No paper trades yet.</Empty>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-400">
                  <tr>
                    <th className="py-1 font-medium">Stock</th>
                    <th className="py-1 font-medium">Status</th>
                    <th className="py-1 text-right font-medium">Entry</th>
                    <th className="py-1 text-right font-medium">Qty</th>
                    <th className="py-1 text-right font-medium">P&L</th>
                    <th className="py-1 text-right font-medium">R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {d.trades.slice(0, 8).map((t) => (
                    <tr key={t.id}>
                      <td className="py-1.5 font-medium">{t.symbol}</td>
                      <td className="py-1.5 text-zinc-500">{t.status}</td>
                      <td className="py-1.5 text-right tabular-nums">{t.entryPrice != null ? `₹${t.entryPrice}` : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{t.quantity ?? "—"}</td>
                      <td className={`py-1.5 text-right tabular-nums ${t.pnl == null ? "text-zinc-400" : t.pnl >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {t.pnl == null ? "—" : inr(t.pnl)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-600">{t.r == null ? "—" : `${t.r >= 0 ? "+" : ""}${t.r.toFixed(2)}R`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Backtest runs" sub="Out-of-sample period shown where available · walk-forward, fills at next open." action={<Link href="/backtest" className="text-xs text-indigo-600 hover:underline">Run one →</Link>}>
          {d.backtests.length === 0 ? (
            <Empty>No backtests yet.</Empty>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-400">
                  <tr>
                    <th className="py-1 font-medium">Stock</th>
                    <th className="py-1 text-right font-medium">Trades</th>
                    <th className="py-1 text-right font-medium">Win</th>
                    <th className="py-1 text-right font-medium">Avg R</th>
                    <th className="py-1 text-right font-medium">PF</th>
                    <th className="py-1 text-right font-medium">Max DD</th>
                    <th className="py-1 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {d.backtests.map((b) => (
                    <tr key={b.id} className={b.status === "failed" ? "text-red-700" : ""}>
                      <td className="py-1.5 font-medium">{b.symbol ?? b.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{b.status === "failed" ? "failed" : b.trades}</td>
                      <td className="py-1.5 text-right tabular-nums">{pct(b.winRate)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(b.avgR)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num(b.profitFactor)}</td>
                      <td className="py-1.5 text-right tabular-nums">{b.maxDD == null ? "—" : `${b.maxDD.toFixed(1)}%`}</td>
                      <td className="py-1.5 text-right text-xs text-zinc-400">{shortDay(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Search history + recently analyzed */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Search history" sub="What you looked up · click to run again." action={<Link href="/activity?kind=search" className="text-xs text-indigo-600 hover:underline">All →</Link>}>
          {d.searches.length === 0 ? (
            <Empty>No searches recorded yet. Searches are logged from now on when you pick a stock or search the knowledge base.</Empty>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 text-sm">
              {d.searches.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={s.href ?? "/research"} className="font-medium text-zinc-900 hover:text-indigo-700">
                      {s.symbol ? `${s.symbol} (${s.exchange})` : s.query}
                    </Link>
                    <p className="truncate text-xs text-zinc-500">
                      {s.scope === "knowledge" ? "knowledge base" : "stock"} · typed “{s.query}”
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-zinc-400">
                    {s.count > 1 && <span className="mr-2 rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600">×{s.count}</span>}
                    {shortDay(s.last)} {timeOfDay(s.last)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recently analyzed" sub="Latest analyses · click to re-run with fresh data." action={<Link href="/activity?kind=analysis" className="text-xs text-indigo-600 hover:underline">All →</Link>}>
          {d.recentAnalyses.length === 0 ? (
            <Empty>No analyses yet.</Empty>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 text-sm">
              {d.recentAnalyses.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/research?symbol=${encodeURIComponent(a.symbol)}&exchange=${a.exchange}`} className="font-medium text-zinc-900 hover:text-indigo-700">
                      {a.symbol} <span className="font-normal text-zinc-400">{a.exchange}</span>
                    </Link>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${OUTCOME_STYLE[a.outcome] ?? "bg-zinc-100 text-zinc-700"}`}>{a.outcomeLabel}</span>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-400">as of {a.asOf}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Watchlist + setups */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Watchlist">
          {d.watchItems.length === 0 ? (
            <Empty>
              Empty. Add stocks from the <Link href="/research" className="underline">Research</Link> page.
            </Empty>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-zinc-100">
                {d.watchItems.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 font-medium">
                      <Link href={`/research?symbol=${encodeURIComponent(i.symbol)}&exchange=${i.exchange}`} className="hover:text-indigo-700">{i.symbol}</Link>
                    </td>
                    <td className="py-2 text-zinc-500">{i.exchange}</td>
                    <td className="py-2 text-right tabular-nums">{i.lastClose != null ? `₹${i.lastClose.toFixed(2)}` : "—"}</td>
                    <td className={`py-2 text-right tabular-nums ${i.changePct == null ? "text-zinc-400" : i.changePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {i.changePct != null ? `${i.changePct >= 0 ? "+" : ""}${i.changePct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="py-2 text-right text-xs text-zinc-400">{i.lastDate ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Setups needing review">
          {d.setups.length === 0 ? (
            <Empty>None yet. Run analyses from the Research page.</Empty>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {d.setups.map((a) => (
                <li key={a.id} className="rounded-md border border-zinc-200 p-3">
                  <Link href={`/research?symbol=${encodeURIComponent(a.symbol)}&exchange=${a.exchange}`} className="font-medium hover:text-indigo-700">{a.symbol}</Link>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${OUTCOME_STYLE[a.outcome]}`}>{a.outcomeLabel}</span>
                  <span className="ml-2 text-xs text-zinc-400">as of {a.asOf}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Activity feed */}
      <div className="mt-4">
        <Card title="Activity history" sub="Most recent actions across the app." action={<Link href="/activity" className="text-xs text-indigo-600 hover:underline">View all →</Link>}>
          <ActivityList items={d.feed} />
        </Card>
      </div>

      {/* Data coverage */}
      <div className="mt-4">
        <Card title="Data coverage" sub={`${c.stockCount} stocks · ${c.candleCount.toLocaleString("en-IN")} daily candles cached`}>
          {d.coverage.length === 0 ? (
            <Empty>No market data cached yet.</Empty>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-400">
                  <tr>
                    <th className="py-1 font-medium">Stock</th>
                    <th className="py-1 font-medium">Provider</th>
                    <th className="py-1 text-right font-medium">Candles</th>
                    <th className="py-1 font-medium">Range</th>
                    <th className="py-1 font-medium">Last sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {d.coverage.map((r) => (
                    <tr key={`${r.symbol}-${r.exchange}`}>
                      <td className="py-1.5 font-medium">{r.symbol} <span className="font-normal text-zinc-400">{r.exchange}</span></td>
                      <td className="py-1.5 text-zinc-500">{r.provider}</td>
                      <td className="py-1.5 text-right tabular-nums">{r.candles}</td>
                      <td className="py-1.5 text-xs text-zinc-500">{r.first ?? "—"} → {r.last ?? "—"}</td>
                      <td className="py-1.5 text-xs text-zinc-400">{r.lastSync ? `${dayKey(r.lastSync)} ${timeOfDay(r.lastSync)}` : "—"}{r.error ? ` · ${r.error}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
