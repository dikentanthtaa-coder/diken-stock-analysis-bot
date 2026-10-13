import "server-only";
import { connection } from "next/server";
import { db } from "@/lib/db";

/* ---------- time helpers (IST day buckets) ---------- */

const TZ = "Asia/Kolkata";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });

export const dayKey = (d: Date) => dayFmt.format(d);
export const shortDay = (d: Date) => shortFmt.format(d);
export const timeOfDay = (d: Date) => timeFmt.format(d);

function lastNDays(n: number): { key: string; label: string; date: Date }[] {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    out.push({ key: dayKey(d), label: shortDay(d), date: d });
  }
  return out;
}

/* ---------- retention ---------- */

/** Activity is kept for one week. Older ActivityEvent rows are deleted
 *  automatically; canonical records (analyses, trades, backtests, videos)
 *  are never deleted here — they just drop out of the activity views. */
export const ACTIVITY_WINDOW_DAYS = 7;
export const windowStart = () => new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 86_400_000);

export async function pruneOldActivity(): Promise<number> {
  try {
    const res = await db.activityEvent.deleteMany({ where: { createdAt: { lt: windowStart() } } });
    return res.count;
  } catch (error) {
    console.error("[activity] prune failed", error);
    return 0;
  }
}

/* ---------- activity feed (merged, de-duplicated by source) ---------- */

export type FeedKind =
  | "search" | "analysis" | "watchlist" | "paper" | "backtest" | "planner" | "knowledge" | "learning" | "signal";

export interface FeedItem {
  id: string;
  kind: FeedKind;
  title: string;
  symbol: string | null;
  exchange: string | null;
  href: string | null;
  at: Date;
  meta?: string | null;
}

export const KIND_LABEL: Record<FeedKind, string> = {
  search: "Search",
  analysis: "Analysis",
  watchlist: "Watchlist",
  paper: "Paper trade",
  backtest: "Backtest",
  planner: "Planner",
  knowledge: "Knowledge",
  learning: "Learning",
  signal: "Signal",
};

const OUTCOME_SHORT: Record<string, string> = {
  PotentialBuySetup: "Potential buy setup",
  WatchlistWait: "Watchlist · wait",
  NoTrade: "No trade",
  InsufficientData: "Insufficient data",
  ReviewPosition: "Review position",
};

/**
 * Analyses, paper trades, backtests and video processing come from their
 * canonical tables (full history). Searches, watchlist, planner and
 * knowledge edits come from ActivityEvent. No source is counted twice.
 */
export async function getActivityFeed(kind?: FeedKind): Promise<FeedItem[]> {
  await connection();
  await pruneOldActivity();
  const since = windowStart();
  const want = (k: FeedKind) => !kind || kind === k;
  const eventKinds: FeedKind[] = ["search", "watchlist", "planner", "knowledge", "signal"];
  const wantEvents = !kind || eventKinds.includes(kind);

  const [events, analyses, trades, runs, videos] = await Promise.all([
    wantEvents
      ? db.activityEvent.findMany({
          where: { kind: kind ?? { in: eventKinds }, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
        })
      : [],
    want("analysis")
      ? db.analysis.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, include: { stock: true } })
      : [],
    want("paper")
      ? db.paperTrade.findMany({ where: { updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, include: { stock: true } })
      : [],
    want("backtest")
      ? db.backtestRun.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" } })
      : [],
    want("learning")
      ? db.video.findMany({ where: { processedAt: { gte: since } }, orderBy: { processedAt: "desc" } })
      : [],
  ]);

  const items: FeedItem[] = [];
  for (const e of events) {
    items.push({
      id: `ev-${e.id}`,
      kind: e.kind as FeedKind,
      title: e.title,
      symbol: e.symbol,
      exchange: e.exchange,
      href: e.href,
      at: e.createdAt,
    });
  }
  for (const a of analyses) {
    items.push({
      id: `an-${a.id}`,
      kind: "analysis",
      title: `Analyzed ${a.stock.symbol} · ${OUTCOME_SHORT[a.outcome] ?? a.outcome}`,
      symbol: a.stock.symbol,
      exchange: a.stock.exchange,
      href: `/research?symbol=${encodeURIComponent(a.stock.symbol)}&exchange=${a.stock.exchange}`,
      at: a.createdAt,
      meta: `as of ${dayKey(a.asOfDate)}`,
    });
  }
  for (const t of trades) {
    const pnl =
      t.status === "closed" && t.exitPrice != null && t.entryPrice != null && t.quantity != null
        ? (t.exitPrice - t.entryPrice) * t.quantity
        : null;
    items.push({
      id: `pt-${t.id}`,
      kind: "paper",
      title: `${t.status === "closed" ? "Closed" : t.status === "open" ? "Opened" : t.status === "cancelled" ? "Cancelled" : "Planned"} paper trade ${t.stock.symbol}${pnl != null ? ` · ${pnl >= 0 ? "+" : ""}₹${pnl.toFixed(0)}` : ""}`,
      symbol: t.stock.symbol,
      exchange: t.stock.exchange,
      href: "/paper",
      at: t.exitDate ?? t.entryDate ?? t.createdAt,
      meta: t.quantity && t.entryPrice ? `${t.quantity} @ ₹${t.entryPrice}` : null,
    });
  }
  for (const r of runs) {
    const p = safeJson<{ symbol?: string; exchange?: string }>(r.paramsJson);
    items.push({
      id: `bt-${r.id}`,
      kind: "backtest",
      title: `${r.status === "failed" ? "Backtest failed" : "Backtested"} ${p?.symbol ?? r.name}`,
      symbol: p?.symbol ?? null,
      exchange: p?.exchange ?? null,
      href: "/backtest",
      at: r.createdAt,
      meta: r.status,
    });
  }
  for (const v of videos) {
    items.push({
      id: `vid-${v.id}`,
      kind: "learning",
      title: `Processed transcript · ${v.title}`,
      symbol: null,
      exchange: null,
      href: "/learning",
      at: v.processedAt ?? v.createdAt,
    });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return items.filter((i) => i.at >= since);
}

export const ACTIVITY_PAGE_SIZE = 25;

export async function getActivityPage(page: number, kind?: FeedKind) {
  const all = await getActivityFeed(kind);
  const pages = Math.max(1, Math.ceil(all.length / ACTIVITY_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * ACTIVITY_PAGE_SIZE;
  return { items: all.slice(start, start + ACTIVITY_PAGE_SIZE), total: all.length, page: current, pages };
}

function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/* ---------- dashboard data ---------- */

export interface Bucket {
  key: string;
  label: string;
  values: number[];
}

export const ACTIVITY_SERIES = ["Searches", "Analyses", "Backtests", "Paper trades", "Learning", "Other"] as const;

export async function getDashboardData() {
  // Dashboard is per-request (uses the current time for day buckets).
  await connection();
  const days = lastNDays(ACTIVITY_WINDOW_DAYS);
  const since = windowStart();

  const [
    counts,
    eventsRecent,
    analysesRecent,
    tradesAll,
    runsAll,
    videos,
    conceptDates,
    ruleDates,
    outcomeGroups,
    searchEvents,
    recentAnalyses,
    setups,
    watchItems,
    coverage,
    feed,
  ] = await Promise.all([
    Promise.all([
      db.analysis.count(),
      db.activityEvent.count({ where: { kind: "search", createdAt: { gte: since } } }),
      db.backtestRun.count(),
      db.paperTrade.count(),
      db.watchlistItem.count(),
      db.video.count({ where: { status: "Completed" } }),
      db.video.count(),
      db.concept.count(),
      db.strategyRule.count(),
      db.candle.count(),
      db.stock.count(),
      db.transcript.count(),
    ]),
    db.activityEvent.findMany({
      where: { createdAt: { gte: since }, kind: { in: ["search", "watchlist", "planner", "knowledge", "signal"] } },
      select: { kind: true, createdAt: true },
    }),
    db.analysis.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.paperTrade.findMany({
      include: { stock: { include: { candles: { orderBy: { date: "desc" }, take: 1 } } } },
      orderBy: { createdAt: "desc" },
    }),
    db.backtestRun.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    db.video.findMany({ select: { status: true, processedAt: true, createdAt: true } }),
    db.concept.findMany({ select: { createdAt: true } }),
    db.strategyRule.findMany({ select: { createdAt: true } }),
    db.analysis.groupBy({ by: ["outcome"], _count: { _all: true } }),
    db.activityEvent.findMany({ where: { kind: "search", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.analysis.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { stock: true } }),
    db.analysis.findMany({
      where: { outcome: { in: ["PotentialBuySetup", "WatchlistWait"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { stock: true },
    }),
    db.watchlistItem.findMany({
      include: { stock: { include: { candles: { orderBy: { date: "desc" }, take: 2 } } } },
      orderBy: { addedAt: "desc" },
      take: 10,
    }),
    db.dataCoverage.findMany(),
    getActivityFeed().then((f) => f.slice(0, 15)),
  ]);

  const [
    analysisCount, searchCount, backtestCount, paperCount, watchCount,
    videosDone, videosTotal, conceptCount, ruleCount, candleCount, stockCount, transcriptCount,
  ] = counts;

  // --- activity per day (last week) ---
  const idx = new Map(days.map((d, i) => [d.key, i]));
  const activity: Bucket[] = days.map((d) => ({ key: d.key, label: d.label, values: [0, 0, 0, 0, 0, 0] }));
  const bump = (date: Date | null | undefined, s: number) => {
    if (!date) return;
    const i = idx.get(dayKey(date));
    if (i != null) activity[i].values[s] += 1;
  };
  for (const e of eventsRecent) bump(e.createdAt, e.kind === "search" ? 0 : 5);
  for (const a of analysesRecent) bump(a.createdAt, 1);
  for (const r of runsAll) bump(r.createdAt, 2);
  for (const t of tradesAll) bump(t.createdAt, 3);
  for (const v of videos) bump(v.processedAt, 4);

  // --- outcomes ---
  const outcomes = outcomeGroups
    .map((g) => ({ outcome: g.outcome, label: OUTCOME_SHORT[g.outcome] ?? g.outcome, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  // --- video pipeline ---
  const videoStatus = ["Completed", "Pending", "Processing", "TranscriptUnavailable", "Failed"].map((s) => ({
    status: s,
    count: videos.filter((v) => v.status === s).length,
  }));

  // --- knowledge growth (cumulative by day, from first entry) ---
  const growth = buildCumulative(
    [conceptDates.map((c) => c.createdAt), ruleDates.map((r) => r.createdAt)],
  );

  // --- paper trading ---
  const trades = tradesAll.map((t) => {
    const last = t.stock.candles[0]?.close ?? null;
    const risk = t.entryPrice != null && t.stopLoss != null ? t.entryPrice - t.stopLoss : null;
    const exit = t.status === "closed" ? t.exitPrice : t.status === "open" ? last : null;
    const pnl = exit != null && t.entryPrice != null && t.quantity != null ? (exit - t.entryPrice) * t.quantity : null;
    const r = exit != null && t.entryPrice != null && risk ? (exit - t.entryPrice) / risk : null;
    return {
      id: t.id,
      symbol: t.stock.symbol,
      exchange: t.stock.exchange,
      status: t.status,
      entryPrice: t.entryPrice,
      stopLoss: t.stopLoss,
      target1: t.target1,
      quantity: t.quantity,
      exitPrice: t.exitPrice,
      exitReason: t.exitReason,
      lastClose: last,
      pnl,
      r,
      realized: t.status === "closed",
      entryDate: t.entryDate,
      exitDate: t.exitDate,
      createdAt: t.createdAt,
    };
  });
  const closed = trades.filter((t) => t.realized && t.pnl != null);
  const paperStats = {
    open: trades.filter((t) => t.status === "open").length,
    planned: trades.filter((t) => t.status === "planned").length,
    closed: closed.length,
    winRate: closed.length ? closed.filter((t) => (t.pnl ?? 0) > 0).length / closed.length : null,
    realizedPnl: closed.reduce((s, t) => s + (t.pnl ?? 0), 0),
    unrealizedPnl: trades.filter((t) => t.status === "open").reduce((s, t) => s + (t.pnl ?? 0), 0),
    avgR: closed.length ? closed.reduce((s, t) => s + (t.r ?? 0), 0) / closed.length : null,
  };

  // --- backtests ---
  const backtests = runsAll.map((r) => {
    const p = safeJson<{ symbol?: string; exchange?: string; days?: number }>(r.paramsJson);
    const res = safeJson<{ periods?: { label: string; tradeCount: number; winRate: number | null; avgR: number | null; profitFactor: number | null; maxDrawdownPct: number | null }[] }>(r.resultsJson);
    const periods = res?.periods ?? [];
    const oos = periods.find((x) => /out/i.test(x.label)) ?? periods.at(-1) ?? null;
    return {
      id: r.id,
      name: r.name,
      symbol: p?.symbol ?? null,
      exchange: p?.exchange ?? null,
      days: p?.days ?? null,
      status: r.status,
      createdAt: r.createdAt,
      trades: periods.reduce((n, x) => n + x.tradeCount, 0),
      oosLabel: oos?.label ?? null,
      winRate: oos?.winRate ?? null,
      avgR: oos?.avgR ?? null,
      profitFactor: oos?.profitFactor ?? null,
      maxDD: oos?.maxDrawdownPct ?? null,
    };
  });

  // --- search history (distinct by query→symbol, newest first) ---
  const seen = new Map<string, { query: string; symbol: string | null; exchange: string | null; scope: string; count: number; last: Date; href: string | null }>();
  for (const e of searchEvents) {
    const d = safeJson<{ query?: string; scope?: string }>(e.detail);
    const key = `${d?.scope ?? "stock"}|${(d?.query ?? e.title).toLowerCase()}|${e.symbol ?? ""}`;
    const cur = seen.get(key);
    if (cur) cur.count += 1;
    else seen.set(key, { query: d?.query ?? e.title, symbol: e.symbol, exchange: e.exchange, scope: d?.scope ?? "stock", count: 1, last: e.createdAt, href: e.href });
  }
  const searches = [...seen.values()].slice(0, 12);

  // --- coverage ---
  const stocksById = new Map(
    (await db.stock.findMany({ select: { id: true, symbol: true, exchange: true, name: true } })).map((s) => [s.id, s]),
  );
  const coverageRows = coverage
    .map((c) => ({
      symbol: stocksById.get(c.stockId)?.symbol ?? "?",
      exchange: stocksById.get(c.stockId)?.exchange ?? "",
      provider: c.provider,
      candles: c.candleCount,
      first: c.firstDate ? dayKey(c.firstDate) : null,
      last: c.lastDate ? dayKey(c.lastDate) : null,
      lastSync: c.lastSync,
      error: c.lastError,
    }))
    .sort((a, b) => b.candles - a.candles);

  return {
    counts: { analysisCount, searchCount, backtestCount, paperCount, watchCount, videosDone, videosTotal, conceptCount, ruleCount, candleCount, stockCount, transcriptCount },
    activity,
    outcomes,
    videoStatus,
    growth,
    trades,
    paperStats,
    backtests,
    searches,
    recentAnalyses: recentAnalyses.map((a) => ({
      id: a.id,
      symbol: a.stock.symbol,
      exchange: a.stock.exchange,
      name: a.stock.name,
      outcome: a.outcome,
      outcomeLabel: OUTCOME_SHORT[a.outcome] ?? a.outcome,
      asOf: dayKey(a.asOfDate),
      at: a.createdAt,
    })),
    setups: setups.map((a) => ({ id: a.id, symbol: a.stock.symbol, exchange: a.stock.exchange, outcome: a.outcome, outcomeLabel: OUTCOME_SHORT[a.outcome] ?? a.outcome, asOf: dayKey(a.asOfDate) })),
    watchItems: watchItems.map((i) => {
      const [last, prev] = i.stock.candles;
      return {
        id: i.id,
        symbol: i.stock.symbol,
        exchange: i.stock.exchange,
        lastClose: last?.close ?? null,
        lastDate: last ? dayKey(last.date) : null,
        changePct: last && prev ? ((last.close - prev.close) / prev.close) * 100 : null,
      };
    }),
    coverage: coverageRows,
    feed,
  };
}

function buildCumulative(seriesDates: Date[][]): Bucket[] {
  const all = seriesDates.flat();
  if (all.length === 0) return [];
  const first = new Date(Math.min(...all.map((d) => d.getTime())));
  const span = Math.min(90, Math.max(7, Math.ceil((Date.now() - first.getTime()) / 86_400_000) + 1));
  const days = lastNDays(span);
  const idx = new Map(days.map((d, i) => [d.key, i]));
  const perDay = seriesDates.map(() => new Array<number>(days.length).fill(0));
  const before = seriesDates.map(() => 0);
  seriesDates.forEach((dates, s) => {
    for (const d of dates) {
      const i = idx.get(dayKey(d));
      if (i == null) before[s] += d.getTime() < days[0].date.getTime() ? 1 : 0;
      else perDay[s][i] += 1;
    }
  });
  return days.map((d, i) => ({
    key: d.key,
    label: d.label,
    values: seriesDates.map((_, s) => before[s] + perDay[s].slice(0, i + 1).reduce((a, b) => a + b, 0)),
  }));
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
