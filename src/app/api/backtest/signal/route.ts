import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { getIntradayBars } from "@/server/market/intraday";
import { getCandles } from "@/server/market/service";
import { isInterval, IST_OFFSET_SEC, SESSION_OPEN_MIN, type Bar, type Interval } from "@/server/market/intervals";
import { runSignalBacktest, DEFAULT_SIGNAL_PARAMS } from "@/server/backtest/signal";

export const maxDuration = 120;

const schema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  interval: z.string().refine(isInterval, "interval must be one of 1m, 5m, 15m, 1h, 4h, 1d"),
  days: z.coerce.number().int().min(250).max(2000).default(1000), // daily only
  entryThreshold: z.coerce.number().min(10).max(80).default(DEFAULT_SIGNAL_PARAMS.entryThreshold),
  exitThreshold: z.coerce.number().min(-50).max(50).default(DEFAULT_SIGNAL_PARAMS.exitThreshold),
  atrStopMult: z.coerce.number().min(0.5).max(5).default(DEFAULT_SIGNAL_PARAMS.atrStopMult),
  rewardMult: z.coerce.number().min(1).max(10).default(DEFAULT_SIGNAL_PARAMS.rewardMult),
  maxHoldBars: z.coerce.number().int().min(3).max(500).default(DEFAULT_SIGNAL_PARAMS.maxHoldBars),
  costPctPerSide: z.coerce.number().min(0).max(2).default(DEFAULT_SIGNAL_PARAMS.costPctPerSide),
  slippagePct: z.coerce.number().min(0).max(2).default(DEFAULT_SIGNAL_PARAMS.slippagePct),
  allowShort: z.coerce.boolean().default(false),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const { exchange, days, symbol: rawSymbol, interval: rawInterval, ...strategyParams } = parsed.data;
  const symbol = rawSymbol.toUpperCase().trim();
  const interval = rawInterval as Interval;

  const run = await db.backtestRun.create({
    data: {
      name: `${symbol} ${exchange} ${interval} signal-engine`,
      paramsJson: JSON.stringify({ symbol, exchange, interval, days, ...strategyParams }),
      status: "running",
    },
  });

  try {
    let bars: Bar[];
    let anchorBars: Bar[] | undefined;
    let freshness: unknown;
    if (interval === "1d") {
      // Long daily history from the EOD cache (TejHQ/Yahoo), stamped at 09:15 IST.
      const data = await getCandles(symbol, exchange, days);
      bars = data.candles.map((c) => ({
        time: Math.floor(new Date(c.date + "T00:00:00Z").getTime() / 1000) - IST_OFFSET_SEC + SESSION_OPEN_MIN * 60,
        open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }));
      freshness = data.freshness;
    } else {
      const [data, daily] = await Promise.all([
        getIntradayBars(symbol, exchange, interval),
        getIntradayBars(symbol, exchange, "1d").catch(() => null),
      ]);
      bars = data.freshness.lastBarForming ? data.bars.slice(0, -1) : data.bars;
      anchorBars = daily ? (daily.freshness.lastBarForming ? daily.bars.slice(0, -1) : daily.bars) : undefined;
      freshness = data.freshness;
    }
    const result = runSignalBacktest(bars, interval, strategyParams, anchorBars);
    await db.backtestRun.update({
      where: { id: run.id },
      data: { status: "completed", resultsJson: JSON.stringify(result), completedAt: new Date() },
    });
    const oos = result.periods.find((p) => /out/i.test(p.label)) ?? result.periods.at(-1);
    const totalTrades = result.periods.reduce((n, p) => n + p.tradeCount, 0);
    await logActivity({
      kind: "backtest",
      title: `Backtested ${symbol} ${interval} signals · ${totalTrades} trades${oos?.winRate != null ? ` · OOS win ${(oos.winRate * 100).toFixed(0)}%` : ""}`,
      detail: {
        runId: run.id, interval, params: strategyParams, totalTrades,
        oosLabel: oos?.label ?? null, oosWinRate: oos?.winRate ?? null, oosAvgR: oos?.avgR ?? null,
        oosProfitFactor: oos?.profitFactor ?? null, oosMaxDrawdownPct: oos?.maxDrawdownPct ?? null,
      },
      symbol,
      exchange,
      href: "/backtest",
    });
    return NextResponse.json({
      ok: true,
      runId: run.id,
      symbol,
      exchange,
      interval,
      candleCount: bars.length,
      freshness,
      result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    await db.backtestRun.update({
      where: { id: run.id },
      data: { status: "failed", error: msg, completedAt: new Date() },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
