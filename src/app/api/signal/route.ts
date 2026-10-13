import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { getIntradayBars, type IntradayData } from "@/server/market/intraday";
import { ProviderError } from "@/server/market/provider";
import { ladderFor, resampleToWeekly, isInterval, type Interval } from "@/server/market/intervals";
import { buildSeries, scoreLatest, combineSignals, type TimeframeScore } from "@/server/signal/engine";
import { getMarketRegime } from "@/server/market/regime";
import { recordSignalEvent } from "@/server/signal/postmortem";
import { getAiProvider } from "@/server/ai/adapter";

export const maxDuration = 60;

const schema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  interval: z.string().refine(isInterval, "interval must be one of 1m, 5m, 15m, 1h, 4h, 1d"),
  log: z.enum(["0", "1"]).default("0"),
  name: z.string().max(120).optional(),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = schema.safeParse({
    symbol: sp.get("symbol"),
    exchange: sp.get("exchange"),
    interval: sp.get("interval") ?? "5m",
    log: sp.get("log") ?? "0",
    name: sp.get("name") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const { exchange, log, name } = parsed.data;
  const symbol = parsed.data.symbol.toUpperCase().trim();
  const interval = parsed.data.interval as Interval;
  const ladder = ladderFor(interval);

  try {
    const [results, regimeRes] = await Promise.all([
      Promise.allSettled(ladder.map((iv) => getIntradayBars(symbol, exchange, iv))),
      getMarketRegime().then((r) => r, (e: unknown) => (e instanceof Error ? e.message : "unavailable")),
    ]);
    const regime = typeof regimeRes === "string" ? null : regimeRes;
    if (typeof regimeRes === "string") console.error("[signal] market regime unavailable:", regimeRes);
    const primaryRes = results[0];
    if (primaryRes.status === "rejected") throw primaryRes.reason;
    const primary = primaryRes.value;

    const warnings = [...primary.warnings];
    const timeframes: TimeframeScore[] = [];
    const timeframeStatus: Record<string, { status: string; bars: number; lastBarTime: number | null }> = {};
    results.forEach((r, idx) => {
      const iv = ladder[idx];
      if (r.status === "rejected") {
        warnings.push(`${iv}: ${r.reason instanceof Error ? r.reason.message : "unavailable"} — excluded from the vote.`);
        timeframeStatus[iv] = { status: "unavailable", bars: 0, lastBarTime: null };
        timeframes.push(emptyScore(iv));
        return;
      }
      const d: IntradayData = r.value;
      timeframeStatus[iv] = { status: d.freshness.status, bars: d.bars.length, lastBarTime: d.freshness.lastBarTime };
      timeframes.push(scoreLatest(buildSeries(d.bars, iv), d.freshness.lastBarForming));
    });
    // Daily primary: add a weekly anchor resampled from the daily bars.
    if (interval === "1d") {
      const weekly = resampleToWeekly(primary.bars);
      // The last weekly bar is still forming while the current week is open.
      const lastWeek = weekly.at(-1);
      const weekForming = lastWeek != null && Date.now() / 1000 - lastWeek.time < 7 * 86_400;
      timeframes.push(scoreLatest(buildSeries(weekly, "1w"), weekForming));
      timeframeStatus["1w"] = { status: primary.freshness.status, bars: weekly.length, lastBarTime: weekly.at(-1)?.time ?? null };
    }

    const dailyIdx = ladder.indexOf("1d");
    const dailyRes = dailyIdx >= 0 ? results[dailyIdx] : null;
    const dailyBars = dailyRes && dailyRes.status === "fulfilled"
      ? (dailyRes.value.freshness.lastBarForming ? dailyRes.value.bars.slice(0, -1) : dailyRes.value.bars)
      : undefined;
    if (!regime) warnings.push("Market regime (NIFTY) unavailable — no market-wide veto applied.");
    const report = combineSignals(
      timeframes,
      interval,
      {
        status: primary.freshness.status,
        lastBarForming: primary.freshness.lastBarForming,
        primaryBars: primary.bars.length,
      },
      {
        market: regime ? { posture: regime.posture, exposureCeilingPct: regime.exposureCeilingPct, headline: regime.headline } : null,
        dailyBars,
      },
    );

    // Stock record (for watchlist / activity joins); never blocks the signal.
    let stockName = name ?? primary.quote.longName ?? symbol;
    try {
      const stock = await db.stock.upsert({
        where: { symbol_exchange: { symbol, exchange } },
        update: {},
        create: { symbol, exchange, name: stockName },
        select: { name: true },
      });
      stockName = stock.name;
    } catch (e) {
      console.error("[signal] stock upsert failed", e);
    }

    // Forward-tested record: persist each new BUY/SELL once per bar.
    let signalEventId: string | null = null;
    if (report.plan && (report.signal === "BUY" || report.signal === "SELL")) {
      try {
        signalEventId = await recordSignalEvent({
          symbol, exchange, interval, report, dataStatus: primary.freshness.status,
        });
      } catch (e) {
        console.error("[signal] record failed", e);
      }
    }

    if (log === "1") {
      await logActivity({
        kind: "signal",
        title: `Signal ${symbol} ${interval} · ${report.signal} (${report.confidence})`,
        detail: {
          interval,
          signal: report.signal,
          confidence: report.confidence,
          combinedScore: report.combinedScore,
          status: primary.freshness.status,
          source: primary.freshness.source,
          lastPrice: primary.quote.lastPrice,
        },
        symbol,
        exchange,
        href: `/signals?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}&interval=${interval}`,
      });
    }

    return NextResponse.json({
      ok: true,
      stock: { symbol, exchange, name: stockName },
      interval,
      // The chart needs recent context only; keep the payload small.
      bars: primary.bars.slice(-600),
      quote: primary.quote,
      freshness: primary.freshness,
      timeframeStatus,
      warnings,
      report,
      regime,
      signalEventId,
      aiAvailable: getAiProvider().available,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    const kind = error instanceof ProviderError ? error.kind : "unavailable";
    const status = kind === "not_found" ? 404 : kind === "rate_limited" ? 429 : 502;
    return NextResponse.json(
      { ok: false, kind, error: error instanceof Error ? error.message : "unknown" },
      { status },
    );
  }
}

function emptyScore(interval: Interval): TimeframeScore {
  return {
    interval,
    index: -1,
    barTime: 0,
    score: 0,
    bias: "neutral",
    trend: "sideways",
    trendEvidence: "n/a",
    factors: [],
    indicators: {
      close: 0, ema20: null, ema50: null, ema200: null, sma20: null, rsi14: null, macd: null, macdSignal: null, macdHist: null,
      bbUpper: null, bbMiddle: null, bbLower: null, percentB: null, bandwidth: null, vwap: null, atr14: null, volume: 0, volumeRatio: null,
      adx14: null, plusDi: null, minusDi: null, stochK: null, stochD: null, obvSlope: null,
    },
    patterns: [],
    levels: [],
    cautions: ["Data unavailable for this timeframe."],
    insufficient: true,
    barsUsed: 0,
  };
}
