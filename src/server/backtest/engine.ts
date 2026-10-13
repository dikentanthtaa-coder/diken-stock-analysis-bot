// Deterministic walk-forward backtester. No look-ahead: every decision at
// bar i uses only bars [0..i]; fills happen at bar i+1's open.
// Pure function — unit-testable without IO.

import { atr, type Candle } from "@/server/analysis/indicators";

export interface BacktestParams {
  // Strategy: enter long when close breaks above the highest close of the
  // prior `breakoutLookback` bars AND volume >= volMult × 20-bar average.
  breakoutLookback: number; // e.g. 20
  volMult: number; // e.g. 1.5
  atrStopMult: number; // stop = entry − atrStopMult × ATR14
  rewardMult: number; // target = entry + rewardMult × risk
  maxHoldBars: number; // time exit
  costPctPerSide: number; // e.g. 0.12 (%)
  slippagePct: number; // e.g. 0.05 (%) applied against the trader
}

export interface BacktestTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  stop: number;
  target: number;
  bars: number;
  exitReason: "stop" | "target" | "time" | "end";
  grossReturnPct: number;
  netReturnPct: number;
  rMultiple: number; // net PnL / initial risk
}

export interface PeriodResult {
  label: string;
  from: string;
  to: string;
  trades: BacktestTrade[];
  tradeCount: number;
  winRate: number | null;
  avgR: number | null; // expectancy in R
  profitFactor: number | null;
  maxDrawdownPct: number | null; // on compounded equity, full allocation per trade
}

export interface BacktestResult {
  params: BacktestParams;
  periods: PeriodResult[];
  limitations: string[];
}

export const DEFAULT_PARAMS: BacktestParams = {
  breakoutLookback: 20,
  volMult: 1.5,
  atrStopMult: 2,
  rewardMult: 2,
  maxHoldBars: 20,
  costPctPerSide: 0.12,
  slippagePct: 0.05,
};

export function computeTrades(candles: Candle[], p: BacktestParams): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const atr14 = atr(candles, 14);
  const need = Math.max(p.breakoutLookback + 1, 21);

  let i = need;
  while (i < candles.length - 1) {
    const window = candles.slice(i - p.breakoutLookback, i);
    const priorHigh = Math.max(...window.map((c) => c.close));
    const avgVol =
      candles.slice(i - 20, i).reduce((a, c) => a + c.volume, 0) / 20;
    const bar = candles[i];
    const a = atr14[i];

    const signal =
      a != null &&
      a > 0 &&
      avgVol > 0 &&
      bar.close > priorHigh &&
      bar.volume >= p.volMult * avgVol;

    if (!signal) {
      i++;
      continue;
    }

    // Fill at next bar's open with adverse slippage.
    const entryIndex = i + 1;
    const entryPrice = candles[entryIndex].open * (1 + p.slippagePct / 100);
    const risk = p.atrStopMult * a;
    if (risk <= 0) {
      i++;
      continue;
    }
    const stop = entryPrice - risk;
    const target = entryPrice + p.rewardMult * risk;

    let exitIndex = -1;
    let exitPrice = 0;
    let exitReason: BacktestTrade["exitReason"] = "end";

    for (let j = entryIndex; j < candles.length; j++) {
      const c = candles[j];
      const barsHeld = j - entryIndex;
      // Gap handling: if the bar opens beyond stop/target, fill at open.
      if (c.open <= stop) {
        exitIndex = j; exitPrice = c.open; exitReason = "stop"; break;
      }
      if (c.open >= target) {
        exitIndex = j; exitPrice = c.open; exitReason = "target"; break;
      }
      // Intrabar: stop checked before target (conservative).
      if (c.low <= stop) {
        exitIndex = j; exitPrice = stop; exitReason = "stop"; break;
      }
      if (c.high >= target) {
        exitIndex = j; exitPrice = target; exitReason = "target"; break;
      }
      if (barsHeld >= p.maxHoldBars) {
        exitIndex = j; exitPrice = c.close; exitReason = "time"; break;
      }
      if (j === candles.length - 1) {
        exitIndex = j; exitPrice = c.close; exitReason = "end";
      }
    }
    if (exitIndex < 0) break;

    exitPrice = exitPrice * (1 - p.slippagePct / 100);
    const gross = (exitPrice - entryPrice) / entryPrice;
    const costs = (p.costPctPerSide * 2) / 100;
    const net = gross - costs;
    trades.push({
      entryDate: candles[entryIndex].date,
      entryPrice,
      exitDate: candles[exitIndex].date,
      exitPrice,
      stop,
      target,
      bars: exitIndex - entryIndex,
      exitReason,
      grossReturnPct: gross * 100,
      netReturnPct: net * 100,
      rMultiple: (net * entryPrice) / risk,
    });
    i = exitIndex + 1; // no overlapping positions
  }
  return trades;
}

function summarize(label: string, candles: Candle[], trades: BacktestTrade[]): PeriodResult {
  const wins = trades.filter((t) => t.netReturnPct > 0);
  const losses = trades.filter((t) => t.netReturnPct <= 0);
  const grossWin = wins.reduce((a, t) => a + t.netReturnPct, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.netReturnPct, 0));

  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.netReturnPct / 100;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
  }

  return {
    label,
    from: candles[0]?.date ?? "n/a",
    to: candles.at(-1)?.date ?? "n/a",
    trades,
    tradeCount: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    avgR: trades.length
      ? trades.reduce((a, t) => a + t.rMultiple, 0) / trades.length
      : null,
    profitFactor:
      grossLoss > 0 ? grossWin / grossLoss : trades.length && grossWin > 0 ? Infinity : null,
    maxDrawdownPct: trades.length ? maxDd * 100 : null,
  };
}

/** Split candles 60/20/20 into development/validation/out-of-sample and
 *  run the same parameters on each period independently. */
export function runBacktest(candles: Candle[], params: BacktestParams): BacktestResult {
  const n = candles.length;
  const devEnd = Math.floor(n * 0.6);
  const valEnd = Math.floor(n * 0.8);
  const splits: [string, Candle[]][] = [
    ["development", candles.slice(0, devEnd)],
    ["validation", candles.slice(devEnd, valEnd)],
    ["out-of-sample", candles.slice(valEnd)],
  ];

  const periods = splits.map(([label, cs]) =>
    summarize(label, cs, cs.length > 40 ? computeTrades(cs, params) : []),
  );

  return {
    params,
    periods,
    limitations: [
      "Daily bars only; intrabar path between open/high/low/close is unknown — stops are checked before targets (conservative).",
      "Prices are unadjusted for corporate actions; splits/bonuses distort signals in affected ranges.",
      "Single-symbol, long-only, one position at a time, full allocation per trade.",
      "Small trade counts (common on one symbol) make every metric statistically weak.",
      "Historical results do not predict future profitability.",
    ],
  };
}
