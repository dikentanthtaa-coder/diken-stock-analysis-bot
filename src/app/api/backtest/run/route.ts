import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { getCandles } from "@/server/market/service";
import { runBacktest, DEFAULT_PARAMS } from "@/server/backtest/engine";

export const maxDuration = 120;

const schema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  days: z.coerce.number().int().min(250).max(2000).default(1000),
  breakoutLookback: z.coerce.number().int().min(5).max(100).default(DEFAULT_PARAMS.breakoutLookback),
  volMult: z.coerce.number().min(1).max(5).default(DEFAULT_PARAMS.volMult),
  atrStopMult: z.coerce.number().min(0.5).max(5).default(DEFAULT_PARAMS.atrStopMult),
  rewardMult: z.coerce.number().min(1).max(10).default(DEFAULT_PARAMS.rewardMult),
  maxHoldBars: z.coerce.number().int().min(3).max(100).default(DEFAULT_PARAMS.maxHoldBars),
  costPctPerSide: z.coerce.number().min(0).max(2).default(DEFAULT_PARAMS.costPctPerSide),
  slippagePct: z.coerce.number().min(0).max(2).default(DEFAULT_PARAMS.slippagePct),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const { symbol, exchange, days, ...params } = parsed.data;

  const run = await db.backtestRun.create({
    data: {
      name: `${symbol} ${exchange} breakout`,
      paramsJson: JSON.stringify({ symbol, exchange, days, ...params }),
      status: "running",
    },
  });

  try {
    const data = await getCandles(symbol, exchange, days);
    const result = runBacktest(data.candles, params);
    await db.backtestRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        resultsJson: JSON.stringify(result),
        completedAt: new Date(),
      },
    });
    const oos = result.periods.find((p) => /out/i.test(p.label)) ?? result.periods.at(-1);
    const totalTrades = result.periods.reduce((n, p) => n + p.tradeCount, 0);
    await logActivity({
      kind: "backtest",
      title: `Backtested ${symbol} · ${totalTrades} trades${oos?.winRate != null ? ` · OOS win ${(oos.winRate * 100).toFixed(0)}%` : ""}`,
      detail: {
        runId: run.id,
        days,
        params,
        totalTrades,
        oosLabel: oos?.label ?? null,
        oosWinRate: oos?.winRate ?? null,
        oosAvgR: oos?.avgR ?? null,
        oosProfitFactor: oos?.profitFactor ?? null,
        oosMaxDrawdownPct: oos?.maxDrawdownPct ?? null,
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
      candleCount: data.candles.length,
      freshness: data.freshness,
      result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    await db.backtestRun.update({
      where: { id: run.id },
      data: { status: "failed", error: msg, completedAt: new Date() },
    });
    await logActivity({
      kind: "backtest",
      title: `Backtest failed for ${symbol}`,
      detail: { runId: run.id, error: msg },
      symbol,
      exchange,
      href: "/backtest",
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
