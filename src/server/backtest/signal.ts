// Walk-forward backtest of the live signal engine on one timeframe.
// At every closed bar i the engine scores bars [0..i] (exactly as the live
// page does); a BUY (or SELL when shorts are allowed) fills at bar i+1's open
// with adverse slippage. Exits: ATR stop, R-multiple target (stop checked
// first intrabar), score reversal, or a time stop.

import { buildSeries, scoreAt } from "@/server/signal/engine";
import { summarize, type BacktestTrade, type PeriodResult } from "./engine";
import { resampleToWeekly, type Bar, type Interval } from "@/server/market/intervals";

export interface SignalBacktestParams {
  entryThreshold: number; // enter when |score| ≥ this (default 25)
  exitThreshold: number; // exit when score crosses below this for longs (default 0)
  atrStopMult: number;
  rewardMult: number;
  maxHoldBars: number;
  costPctPerSide: number;
  slippagePct: number;
  allowShort: boolean;
}

export const DEFAULT_SIGNAL_PARAMS: SignalBacktestParams = {
  entryThreshold: 25,
  exitThreshold: 0,
  atrStopMult: 1.5,
  rewardMult: 2,
  maxHoldBars: 40,
  costPctPerSide: 0.12,
  slippagePct: 0.05,
  allowShort: false,
};

/** Pre-scored higher-timeframe bars used as the trend veto, looked up by
 *  time so that only anchor bars already closed at the primary bar's time
 *  are consulted. */
export interface AnchorScores {
  interval: Interval | "1w";
  /** Unix seconds at which each anchor bar is closed. */
  closeTimes: number[];
  scores: number[];
}

export function buildAnchor(bars: Bar[], interval: Interval | "1w"): AnchorScores {
  const s = buildSeries(bars, interval);
  const span = interval === "1w" ? 7 * 86_400 : interval === "1d" ? 6.25 * 3600 : 0;
  const closeTimes: number[] = [];
  const scores: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const sc = scoreAt(s, i);
    closeTimes.push(bars[i].time + span);
    scores.push(sc.insufficient ? 0 : sc.score);
  }
  return { interval, closeTimes, scores };
}

/** Score of the last anchor bar closed strictly before `t` (0 if none). */
export function anchorScoreAt(a: AnchorScores | undefined, t: number): number | null {
  if (!a || a.closeTimes.length === 0) return null;
  let lo = 0, hi = a.closeTimes.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (a.closeTimes[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : a.scores[ans];
}

export interface SignalTrade extends BacktestTrade {
  direction: "long" | "short";
  entryScore: number;
}

export interface SignalPeriodResult extends PeriodResult {
  trades: SignalTrade[];
  barsScored: number;
  buySignals: number;
  sellSignals: number;
  vetoed: number;
  avgRewardRiskPlanned: number | null;
}

export interface SignalBacktestResult {
  interval: Interval;
  anchorInterval: Interval | "1w" | null;
  params: SignalBacktestParams;
  periods: SignalPeriodResult[];
  limitations: string[];
}

const fmtTime = (t: number, interval: Interval) =>
  interval === "1d"
    ? new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    : new Date(t * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export function computeSignalTrades(
  bars: Bar[],
  interval: Interval,
  p: SignalBacktestParams,
  anchor?: AnchorScores,
): { trades: SignalTrade[]; barsScored: number; buySignals: number; sellSignals: number; vetoed: number } {
  const s = buildSeries(bars, interval);
  const trades: SignalTrade[] = [];
  let barsScored = 0;
  let buySignals = 0;
  let sellSignals = 0;
  let vetoed = 0;
  let i = s.minBars;
  while (i < bars.length - 1) {
    const sc = scoreAt(s, i);
    if (sc.insufficient) { i++; continue; }
    barsScored++;
    if (sc.score >= p.entryThreshold) buySignals++;
    if (sc.score <= -p.entryThreshold) sellSignals++;
    let long = sc.score >= p.entryThreshold;
    let short = p.allowShort && sc.score <= -p.entryThreshold;
    // Same veto as the live page: never trade against a strong higher-timeframe trend.
    const an = anchorScoreAt(anchor, bars[i].time);
    if (an != null) {
      if (long && an <= -20) { long = false; vetoed++; }
      if (short && an >= 20) { short = false; vetoed++; }
    }
    const a = sc.indicators.atr14;
    if ((!long && !short) || a == null || a <= 0) { i++; continue; }
    const dir = long ? 1 : -1;
    const entryIndex = i + 1;
    const entryPrice = bars[entryIndex].open * (1 + (dir * p.slippagePct) / 100);
    const risk = p.atrStopMult * a;
    const stop = entryPrice - dir * risk;
    const target = entryPrice + dir * p.rewardMult * risk;

    let exitIndex = -1;
    let exitPrice = 0;
    let exitReason: BacktestTrade["exitReason"] = "end";
    for (let j = entryIndex; j < bars.length; j++) {
      const c = bars[j];
      const held = j - entryIndex;
      const hitStop = dir > 0 ? c.low <= stop : c.high >= stop;
      const hitTarget = dir > 0 ? c.high >= target : c.low <= target;
      const gapStop = dir > 0 ? c.open <= stop : c.open >= stop;
      const gapTarget = dir > 0 ? c.open >= target : c.open <= target;
      if (gapStop) { exitIndex = j; exitPrice = c.open; exitReason = "stop"; break; }
      if (gapTarget) { exitIndex = j; exitPrice = c.open; exitReason = "target"; break; }
      if (hitStop) { exitIndex = j; exitPrice = stop; exitReason = "stop"; break; }
      if (hitTarget) { exitIndex = j; exitPrice = target; exitReason = "target"; break; }
      // Signal reversal on a closed bar (j is closed once we evaluate it).
      if (held > 0) {
        const sj = scoreAt(s, j);
        if (!sj.insufficient && (dir > 0 ? sj.score <= p.exitThreshold : sj.score >= -p.exitThreshold)) {
          exitIndex = j; exitPrice = c.close; exitReason = "time"; break;
        }
      }
      if (held >= p.maxHoldBars) { exitIndex = j; exitPrice = c.close; exitReason = "time"; break; }
      if (j === bars.length - 1) { exitIndex = j; exitPrice = c.close; exitReason = "end"; }
    }
    if (exitIndex < 0) break;
    exitPrice = exitPrice * (1 - (dir * p.slippagePct) / 100);
    const gross = (dir * (exitPrice - entryPrice)) / entryPrice;
    const net = gross - (p.costPctPerSide * 2) / 100;
    trades.push({
      direction: dir > 0 ? "long" : "short",
      entryScore: sc.score,
      entryDate: fmtTime(bars[entryIndex].time, interval),
      entryPrice,
      exitDate: fmtTime(bars[exitIndex].time, interval),
      exitPrice,
      stop,
      target,
      bars: exitIndex - entryIndex,
      exitReason,
      grossReturnPct: gross * 100,
      netReturnPct: net * 100,
      rMultiple: (net * entryPrice) / risk,
    });
    i = exitIndex + 1;
  }
  return { trades, barsScored, buySignals, sellSignals, vetoed };
}

export function runSignalBacktest(
  bars: Bar[],
  interval: Interval,
  params: SignalBacktestParams,
  anchorBars?: Bar[],
): SignalBacktestResult {
  // Anchor: weekly for a daily primary (derived from the same bars), else
  // the daily bars supplied by the caller. Scores use only past anchor bars.
  const anchor =
    interval === "1d"
      ? buildAnchor(resampleToWeekly(bars), "1w")
      : anchorBars && anchorBars.length
        ? buildAnchor(anchorBars, "1d")
        : undefined;
  const n = bars.length;
  const devEnd = Math.floor(n * 0.6);
  const valEnd = Math.floor(n * 0.8);
  const splits: [string, Bar[]][] = [
    ["development", bars.slice(0, devEnd)],
    ["validation", bars.slice(devEnd, valEnd)],
    ["out-of-sample", bars.slice(valEnd)],
  ];
  const periods = splits.map(([label, bs]) => {
    const r = bs.length > 80 ? computeSignalTrades(bs, interval, params, anchor) : { trades: [], barsScored: 0, buySignals: 0, sellSignals: 0, vetoed: 0 };
    const dated = bs.map((b) => ({ date: fmtTime(b.time, interval) }));
    const base = summarize(label, dated, r.trades);
    return {
      ...base,
      trades: r.trades,
      barsScored: r.barsScored,
      buySignals: r.buySignals,
      sellSignals: r.sellSignals,
      vetoed: r.vetoed,
      avgRewardRiskPlanned: r.trades.length ? params.rewardMult : null,
    };
  });
  return {
    interval,
    anchorInterval: anchor?.interval ?? null,
    params,
    periods,
    limitations: [
      anchor
        ? `Higher-timeframe veto uses closed ${anchor.interval} bars only; the live page additionally votes across two intermediate timeframes, so this is a close but not identical replica.`
        : "No higher-timeframe data was available, so the live page's trend veto was not applied here.",
      "Each period is scored independently, so indicators warm up again at the start of every split (no leakage between periods).",
      "Intrabar path is unknown: stops are assumed to hit before targets within the same bar (conservative).",
      interval === "1d"
        ? "Daily prices are unadjusted for corporate actions; splits/bonuses distort affected ranges."
        : `Intraday history is limited by the provider (${interval === "1m" ? "~7 days" : interval === "5m" || interval === "15m" ? "~60 days" : "~2 years"}); short samples make every metric statistically weak.`,
      "One symbol, one position at a time, full allocation per trade, no overnight-gap modelling beyond open fills.",
      "Past performance never predicts future results; the thresholds were not optimised on this symbol.",
    ],
  };
}
