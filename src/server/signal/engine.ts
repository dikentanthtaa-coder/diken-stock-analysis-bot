// Multi-timeframe BUY / SELL / HOLD signal engine.
//
// Pure, deterministic, lookahead-free: `scoreAt(series, i)` uses only bars
// [0..i], so the live page and the backtester run the very same code. The
// combined signal is a weighted vote across timeframes; "confidence" is the
// strength of agreement among indicators and timeframes — it is NOT a
// probability that a trade will be profitable.

import {
  ema,
  rsi,
  atr,
  sma,
  macd,
  bollinger,
  vwap,
  rollingVwap,
  findSwings,
  findLevels,
  classifyTrend,
  adx,
  stochastic,
  obv,
  trendTemplate,
  type TrendTemplate,
  type Candle,
  type Level,
  type SwingPoint,
  type Trend,
} from "@/server/analysis/indicators";
import { detectPatternsAt, type PatternHit } from "@/server/analysis/patterns";
import { INTERVAL_SPEC, istDay, type Bar, type Interval } from "@/server/market/intervals";

export type Signal = "BUY" | "SELL" | "HOLD";
export type FactorGroup = "trend" | "momentum" | "bands" | "vwap" | "volume" | "pattern" | "levels";

export interface Factor {
  group: FactorGroup;
  label: string;
  /** Contribution to the timeframe score (positive = bullish). */
  score: number;
  detail: string;
}

export interface IndicatorSnapshot {
  close: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  percentB: number | null;
  bandwidth: number | null;
  vwap: number | null;
  atr14: number | null;
  volume: number;
  volumeRatio: number | null;
  adx14: number | null;
  plusDi: number | null;
  minusDi: number | null;
  stochK: number | null;
  stochD: number | null;
  obvSlope: number | null; // 20-bar OBV change normalised by average volume
}

export interface TimeframeScore {
  interval: Interval | "1w";
  /** Index of the bar the score was computed on (last closed bar). */
  index: number;
  barTime: number;
  score: number; // −100 … +100
  bias: "bullish" | "bearish" | "neutral";
  trend: Trend;
  trendEvidence: string;
  factors: Factor[];
  indicators: IndicatorSnapshot;
  patterns: PatternHit[];
  levels: Level[];
  cautions: string[];
  insufficient: boolean;
  barsUsed: number;
}

export interface Series {
  interval: Interval | "1w";
  bars: Bar[];
  candles: Candle[];
  closes: number[];
  ema20: (number | null)[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  sma20: (number | null)[];
  rsi14: (number | null)[];
  macd: ReturnType<typeof macd>;
  bb: ReturnType<typeof bollinger>;
  vwap: (number | null)[];
  atr14: (number | null)[];
  volSma20: (number | null)[];
  adx: ReturnType<typeof adx>;
  stoch: ReturnType<typeof stochastic>;
  obv: number[];
  swings: SwingPoint[];
  minBars: number;
}

const SWING_SPAN = 2;

/** Precompute every indicator once; `scoreAt` then reads index i. */
export function buildSeries(bars: Bar[], interval: Interval | "1w"): Series {
  const candles: Candle[] = bars.map((b) => ({
    date: new Date(b.time * 1000).toISOString(),
    open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
  }));
  const closes = bars.map((b) => b.close);
  const intraday = interval !== "1d" && interval !== "1w";
  return {
    interval,
    bars,
    candles,
    closes,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    sma20: sma(closes, 20),
    rsi14: rsi(closes, 14),
    macd: macd(closes, 12, 26, 9),
    bb: bollinger(closes, 20, 2),
    vwap: intraday ? vwap(bars, (i) => istDay(bars[i].time)) : rollingVwap(bars, 20),
    atr14: atr(candles, 14),
    volSma20: sma(bars.map((b) => b.volume), 20),
    adx: adx(bars, 14),
    stoch: stochastic(bars, 14, 3),
    obv: obv(bars),
    swings: findSwings(candles, SWING_SPAN),
    minBars: interval === "1w" ? 30 : INTERVAL_SPEC[interval].minBars,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (v: number | null | undefined, d = 2) => (v == null ? "n/a" : v.toFixed(d));

/** Score the timeframe using bars [0..i] only. */
export function scoreAt(s: Series, i: number): TimeframeScore {
  const bar = s.bars[i];
  const close = s.closes[i];
  const snap: IndicatorSnapshot = {
    close,
    ema20: s.ema20[i], ema50: s.ema50[i], ema200: s.ema200[i], sma20: s.sma20[i],
    rsi14: s.rsi14[i],
    macd: s.macd[i].macd, macdSignal: s.macd[i].signal, macdHist: s.macd[i].histogram,
    bbUpper: s.bb[i].upper, bbMiddle: s.bb[i].middle, bbLower: s.bb[i].lower,
    percentB: s.bb[i].percentB, bandwidth: s.bb[i].bandwidth,
    vwap: s.vwap[i], atr14: s.atr14[i],
    volume: bar.volume,
    // A zero-volume bar amid normal volume is a provider gap (Yahoo often
    // reports 0 for the final bar right after the close), not "no trading".
    volumeRatio: bar.volume > 0 && s.volSma20[i] && s.volSma20[i]! > 0 ? bar.volume / s.volSma20[i]! : null,
    adx14: s.adx[i].adx,
    plusDi: s.adx[i].plusDi,
    minusDi: s.adx[i].minusDi,
    stochK: s.stoch[i].k,
    stochD: s.stoch[i].d,
    obvSlope:
      i >= 20 && s.volSma20[i] && s.volSma20[i]! > 0 ? (s.obv[i] - s.obv[i - 20]) / (s.volSma20[i]! * 20) : null,
  };
  const factors: Factor[] = [];
  const cautions: string[] = [];
  const barsUsed = i + 1;
  const insufficient = barsUsed < s.minBars || snap.ema50 == null || snap.rsi14 == null || snap.atr14 == null;

  // Swings confirmed by bar i (a swing at k needs SWING_SPAN bars after it).
  const swings = s.swings.filter((sw) => sw.index + SWING_SPAN <= i);
  const { trend, evidence: trendEvidence } = classifyTrend(swings);
  const a = snap.atr14 ?? ((bar.high - bar.low) || close * 0.01);
  // Cluster tolerance scales with volatility: ~1 ATR wide, bounded to
  // 0.2%–1.5% so 5-minute swings are not all merged into one level while
  // daily levels keep the research engine's 1.5% band.
  const tolerancePct = clamp((a / close) * 100, 0.2, 1.5);
  const levels = findLevels(swings.slice(-80), close, tolerancePct);

  if (insufficient) {
    return {
      interval: s.interval, index: i, barTime: bar.time, score: 0, bias: "neutral", trend, trendEvidence,
      factors, indicators: snap, patterns: [], levels, barsUsed, insufficient: true,
      cautions: [`Only ${barsUsed} closed bars on ${s.interval}; need ≥ ${s.minBars} for a reliable read.`],
    };
  }

  // ---- Trend (cap ±35) ----
  let t = 0;
  if (snap.ema20 != null && snap.ema50 != null) {
    const d = (snap.ema20 - snap.ema50) / a;
    const v = clamp(d, -1.5, 1.5) * 8; // ±12
    t += v;
    factors.push({ group: "trend", label: "EMA20 vs EMA50", score: v, detail: `EMA20 ${fmt(snap.ema20)} is ${snap.ema20 >= snap.ema50 ? "above" : "below"} EMA50 ${fmt(snap.ema50)} (${d.toFixed(2)} ATR apart).` });
  }
  if (snap.ema50 != null) {
    const d = (close - snap.ema50) / a;
    const v = clamp(d, -2, 2) * 4; // ±8
    t += v;
    factors.push({ group: "trend", label: "Price vs EMA50", score: v, detail: `Close ${fmt(close)} is ${d >= 0 ? "above" : "below"} EMA50 by ${Math.abs(d).toFixed(2)} ATR.` });
  }
  if (snap.ema200 != null) {
    const v = close > snap.ema200 ? 6 : -6;
    t += v;
    factors.push({ group: "trend", label: "Price vs EMA200", score: v, detail: `Close is ${v > 0 ? "above" : "below"} EMA200 ${fmt(snap.ema200)} (long-term ${v > 0 ? "bullish" : "bearish"}).` });
  }
  if (i >= 5 && s.ema20[i] != null && s.ema20[i - 5] != null) {
    const slope = (s.ema20[i]! - s.ema20[i - 5]!) / a;
    const v = clamp(slope, -1, 1) * 5; // ±5
    t += v;
    factors.push({ group: "trend", label: "EMA20 slope", score: v, detail: `EMA20 moved ${slope >= 0 ? "+" : ""}${slope.toFixed(2)} ATR over the last 5 bars.` });
  }
  {
    const v = trend === "uptrend" ? 8 : trend === "downtrend" ? -8 : 0;
    t += v;
    factors.push({ group: "trend", label: "Market structure", score: v, detail: trendEvidence });
  }
  // ADX: trend strength gates the trend factors. Below 20 the market is
  // ranging, so trend-following evidence is discounted; above 25 the
  // dominant DI adds conviction.
  if (snap.adx14 != null && snap.plusDi != null && snap.minusDi != null) {
    const dirUp = snap.plusDi > snap.minusDi;
    if (snap.adx14 < 20) {
      t *= 0.6;
      factors.push({ group: "trend", label: "ADX 14", score: 0, detail: `ADX ${snap.adx14.toFixed(1)} < 20: no trend — trend factors discounted 40%.` });
      cautions.push(`ADX ${snap.adx14.toFixed(0)}: ranging market, trend signals unreliable.`);
    } else if (snap.adx14 >= 25) {
      const v = dirUp ? 6 : -6;
      t += v;
      factors.push({ group: "trend", label: "ADX 14", score: v, detail: `ADX ${snap.adx14.toFixed(1)} with ${dirUp ? "+DI" : "−DI"} dominant (${snap.plusDi.toFixed(0)} vs ${snap.minusDi.toFixed(0)}): ${dirUp ? "strong uptrend" : "strong downtrend"}.` });
    } else {
      factors.push({ group: "trend", label: "ADX 14", score: 0, detail: `ADX ${snap.adx14.toFixed(1)}: trend developing (${dirUp ? "+DI" : "−DI"} leads).` });
    }
  }
  t = clamp(t, -35, 35);

  // ---- Momentum (cap ±25) ----
  let m = 0;
  if (snap.rsi14 != null) {
    const r = snap.rsi14;
    let v = clamp((r - 50) / 20, -1, 1) * 10;
    let note = `RSI14 ${r.toFixed(1)} (${r > 50 ? "bullish" : r < 50 ? "bearish" : "neutral"} side of 50).`;
    if (r >= 75) { v -= 5; note += " Overbought (≥75): stretched, chasing worsens risk/reward."; cautions.push(`RSI ${r.toFixed(0)} is overbought.`); }
    if (r <= 25) { v += 5; note += " Oversold (≤25): stretched to the downside, bounce risk for shorts."; cautions.push(`RSI ${r.toFixed(0)} is oversold.`); }
    m += v;
    factors.push({ group: "momentum", label: "RSI 14", score: v, detail: note });
  }
  if (snap.macdHist != null && snap.macd != null && snap.macdSignal != null) {
    let v = snap.macdHist > 0 ? 7 : -7;
    let note = `MACD ${fmt(snap.macd, 3)} ${snap.macdHist > 0 ? "above" : "below"} signal ${fmt(snap.macdSignal, 3)} (hist ${fmt(snap.macdHist, 3)}).`;
    // Recent cross within 3 bars.
    for (let k = 1; k <= 3 && i - k >= 0; k++) {
      const h = s.macd[i - k].histogram;
      if (h != null && Math.sign(h) !== Math.sign(snap.macdHist) && h !== 0) {
        v += snap.macdHist > 0 ? 5 : -5;
        note += ` ${snap.macdHist > 0 ? "Bullish" : "Bearish"} crossover ${k} bar${k > 1 ? "s" : ""} ago.`;
        break;
      }
    }
    v += snap.macd > 0 ? 3 : -3;
    m += v;
    factors.push({ group: "momentum", label: "MACD 12/26/9", score: v, detail: note });
  }
  if (snap.stochK != null && snap.stochD != null && i >= 1) {
    const pk = s.stoch[i - 1].k, pd = s.stoch[i - 1].d;
    let v = 0;
    let note = `%K ${snap.stochK.toFixed(0)} / %D ${snap.stochD.toFixed(0)}.`;
    if (pk != null && pd != null) {
      if (pk <= pd && snap.stochK > snap.stochD && pk < 25) { v = 6; note += " Bullish cross from oversold."; }
      else if (pk >= pd && snap.stochK < snap.stochD && pk > 75) { v = -6; note += " Bearish cross from overbought."; }
      else if (snap.stochK > 80) { v = -2; note += " Overbought zone."; }
      else if (snap.stochK < 20) { v = 2; note += " Oversold zone."; }
    }
    m += v;
    factors.push({ group: "momentum", label: "Stochastic 14/3", score: v, detail: note });
  }
  m = clamp(m, -25, 25);

  // ---- Bollinger (cap ±10) ----
  let bb = 0;
  if (snap.percentB != null && snap.bbUpper != null && snap.bbLower != null) {
    const pB = snap.percentB;
    const v = clamp((pB - 0.5) * 2, -1, 1) * 10;
    bb += v;
    let note = `%B ${pB.toFixed(2)}: close sits ${pB >= 0.5 ? "in the upper" : "in the lower"} half of the bands (${fmt(snap.bbLower)}–${fmt(snap.bbUpper)}).`;
    if (pB > 1) { note += " Above the upper band — extended."; cautions.push("Price is outside the upper Bollinger Band (extended)."); }
    if (pB < 0) { note += " Below the lower band — extended."; cautions.push("Price is outside the lower Bollinger Band (extended)."); }
    // Squeeze: bandwidth at/near the 40-bar minimum.
    if (snap.bandwidth != null && i >= 40) {
      let minBw = Infinity;
      for (let k = i - 40; k < i; k++) { const w = s.bb[k].bandwidth; if (w != null) minBw = Math.min(minBw, w); }
      if (snap.bandwidth <= minBw * 1.05) { note += " Bandwidth at a 40-bar low: squeeze, a range expansion is pending."; cautions.push("Bollinger squeeze: direction undecided until bands expand."); }
    }
    factors.push({ group: "bands", label: "Bollinger 20/2", score: v, detail: note });
  }

  // ---- VWAP (cap ±8) ----
  let vw = 0;
  if (snap.vwap != null) {
    const d = (close - snap.vwap) / a;
    const v = clamp(d, -1, 1) * 8;
    vw += v;
    const kind = s.interval === "1d" || s.interval === "1w" ? "20-bar VWAP" : "session VWAP";
    factors.push({ group: "vwap", label: kind, score: v, detail: `Close is ${d >= 0 ? "above" : "below"} ${kind} ${fmt(snap.vwap)} by ${Math.abs(d).toFixed(2)} ATR.` });
  }

  // ---- Volume (cap ±12, plus participation multiplier) ----
  let vol = 0;
  let participation = 1;
  if (snap.volumeRatio != null) {
    const ratio = snap.volumeRatio;
    const up = bar.close >= bar.open;
    if (ratio >= 1.5) {
      vol = up ? clamp(ratio, 1.5, 3) * 4 : -clamp(ratio, 1.5, 3) * 4;
      factors.push({ group: "volume", label: "Volume", score: vol, detail: `Volume ${ratio.toFixed(2)}× the 20-bar average on a${up ? " green" : " red"} bar — ${up ? "buyers" : "sellers"} confirmed.` });
    } else if (ratio < 0.7) {
      participation = 0.85;
      factors.push({ group: "volume", label: "Volume", score: 0, detail: `Volume only ${ratio.toFixed(2)}× average — weak participation; score damped by 15%.` });
      cautions.push("Low volume: moves without participation are less reliable.");
    } else {
      factors.push({ group: "volume", label: "Volume", score: 0, detail: `Volume ${ratio.toFixed(2)}× the 20-bar average (normal).` });
    }
  }

  if (snap.obvSlope != null && i >= 20) {
    const priceChg = (close - s.closes[i - 20]) / a;
    let v = 0;
    let note = `OBV ${snap.obvSlope >= 0 ? "rising" : "falling"} over 20 bars (${snap.obvSlope >= 0 ? "+" : ""}${snap.obvSlope.toFixed(2)}× avg volume).`;
    if (priceChg > 1 && snap.obvSlope < -0.5) { v = -4; note += " Bearish divergence: price up, volume flow down."; cautions.push("OBV diverges from price (bearish)."); }
    else if (priceChg < -1 && snap.obvSlope > 0.5) { v = 4; note += " Bullish divergence: price down, volume flow up."; }
    else if (Math.sign(priceChg) === Math.sign(snap.obvSlope) && Math.abs(snap.obvSlope) > 0.5) { v = snap.obvSlope > 0 ? 3 : -3; note += " Confirms the price move."; }
    vol += v;
    factors.push({ group: "volume", label: "OBV trend", score: v, detail: note });
  }
  vol = clamp(vol, -12, 12);

  // ---- Patterns (cap ±15) over the last 3 closed bars ----
  const patterns: PatternHit[] = [];
  for (let k = Math.max(1, i - 2); k <= i; k++) patterns.push(...detectPatternsAt(s.candles, k));
  let pat = 0;
  for (const p of patterns) {
    const recency = p.index === i ? 1 : p.index === i - 1 ? 0.7 : 0.4;
    pat += (p.direction === "bullish" ? 1 : p.direction === "bearish" ? -1 : 0) * p.strength * 5 * recency;
  }
  pat = clamp(pat, -15, 15);
  if (patterns.length) {
    factors.push({ group: "pattern", label: "Candlestick patterns", score: pat, detail: patterns.map((p) => `${p.name} (${p.direction}, ${p.index === i ? "last bar" : `${i - p.index} bars ago`})`).join("; ") });
  }

  // ---- Levels (cap ±10) ----
  let lv = 0;
  const support = levels.filter((l) => l.kind === "support").at(-1) ?? null;
  const resistance = levels.find((l) => l.kind === "resistance") ?? null;
  if (resistance && (resistance.price - close) / a < 1) {
    lv -= 6;
    factors.push({ group: "levels", label: "Resistance overhead", score: -6, detail: `Resistance ${fmt(resistance.price)} (${resistance.touches} touches) is within 1 ATR — limited room.` });
  }
  if (support && (close - support.price) / a < 1) {
    lv += 6;
    factors.push({ group: "levels", label: "Support below", score: 6, detail: `Support ${fmt(support.price)} (${support.touches} touches) is within 1 ATR — demand zone.` });
  }
  // Breakout/breakdown through a level within the last 5 bars.
  for (const l of levels) {
    let crossedUp = false, crossedDown = false;
    for (let k = Math.max(1, i - 4); k <= i; k++) {
      if (s.closes[k - 1] <= l.price && s.closes[k] > l.price) crossedUp = true;
      if (s.closes[k - 1] >= l.price && s.closes[k] < l.price) crossedDown = true;
    }
    if (crossedUp && close > l.price) {
      const confirmed = snap.volumeRatio != null && snap.volumeRatio >= 1.2;
      const v = confirmed ? 10 : 5;
      lv += v;
      factors.push({ group: "levels", label: "Breakout", score: v, detail: `Closed above ${fmt(l.price)} (${l.touches} touches) within the last 5 bars${confirmed ? " with above-average volume" : " on ordinary volume"}.` });
      break;
    }
    if (crossedDown && close < l.price) {
      const confirmed = snap.volumeRatio != null && snap.volumeRatio >= 1.2;
      const v = confirmed ? -10 : -5;
      lv += v;
      factors.push({ group: "levels", label: "Breakdown", score: v, detail: `Closed below ${fmt(l.price)} (${l.touches} touches) within the last 5 bars${confirmed ? " with above-average volume" : " on ordinary volume"}.` });
      break;
    }
  }
  lv = clamp(lv, -10, 10);

  const raw = (t + m + bb + vw + vol + pat + lv) * participation;
  const score = Math.round(clamp(raw, -100, 100));
  return {
    interval: s.interval,
    index: i,
    barTime: bar.time,
    score,
    bias: score >= 15 ? "bullish" : score <= -15 ? "bearish" : "neutral",
    trend,
    trendEvidence,
    factors,
    indicators: snap,
    patterns,
    levels,
    cautions,
    insufficient: false,
    barsUsed,
  };
}

/* ---------- combining timeframes ---------- */

export interface TradePlan {
  direction: "long" | "short";
  entry: number;
  entryNote: string;
  stop: number;
  stopNote: string;
  target1: number;
  target2: number;
  targetNote: string;
  riskPerShare: number;
  rewardRiskT1: number;
  rewardRiskT2: number;
  atr: number;
  basisInterval: Interval | "1w";
}

export interface DataQuality {
  status: "live" | "delayed" | "closed" | "stale" | "unavailable";
  lastBarForming: boolean;
  primaryBars: number;
}

/** Market-wide context (NIFTY regime) that can veto or damp a signal. */
export interface MarketContext {
  posture: "confirmed-uptrend" | "under-pressure" | "correction" | "rally-attempt";
  exposureCeilingPct: number;
  headline: string;
}

export interface SignalReport {
  signal: Signal;
  /** 0–100: how strongly indicators and timeframes agree. Not a win probability. */
  confidence: number;
  confidenceLabel: "low" | "moderate" | "high";
  combinedScore: number;
  agreement: number; // 0–1 weight share agreeing with the combined direction
  primary: Interval;
  weights: Record<string, number>;
  timeframes: TimeframeScore[];
  plan: TradePlan | null;
  levelsToWatch: { support: number | null; resistance: number | null };
  reasons: string[];
  cautions: string[];
  market: MarketContext | null;
  trendTemplate: TrendTemplate | null;
  /** When a BUY/SELL was overridden to HOLD, the original signal and why. */
  vetoed: { signal: Signal; reason: string } | null;
  disclaimer: string;
}

const DISCLAIMER =
  "Signals are derived mechanically from price, volume and indicator readings. Confidence measures agreement among them, not the probability of profit. Markets are unpredictable; no signal guarantees an outcome. This is research output, not investment advice.";

export function combineSignals(
  tfs: TimeframeScore[],
  primary: Interval,
  quality: DataQuality,
  context: { market?: MarketContext | null; dailyBars?: Bar[] } = {},
): SignalReport {
  const market = context.market ?? null;
  const tt = context.dailyBars && context.dailyBars.length >= 200 ? trendTemplate(context.dailyBars) : null;
  // Weights: primary 0.4, then 0.25, 0.2, remainder to the trend anchor.
  const base = [0.4, 0.25, 0.2, 0.15];
  const usable = tfs.filter((t) => !t.insufficient);
  const weights: Record<string, number> = {};
  let wsum = 0;
  tfs.forEach((t, idx) => {
    const w = t.insufficient ? 0 : base[Math.min(idx, base.length - 1)];
    weights[t.interval] = w;
    wsum += w;
  });
  if (wsum > 0) for (const k of Object.keys(weights)) weights[k] /= wsum;

  const combined = usable.reduce((acc, t) => acc + t.score * weights[t.interval], 0);
  const dir = Math.sign(combined);
  const agreement = usable.reduce(
    (acc, t) => acc + (Math.abs(t.score) >= 10 && Math.sign(t.score) === dir ? weights[t.interval] : 0),
    0,
  );
  const anchor = usable.find((t) => t.interval === "1d" || t.interval === "1w") ?? null;
  const primaryTf = tfs.find((t) => t.interval === primary) ?? null;

  let signal: Signal = "HOLD";
  const cautions: string[] = [];
  if (usable.length === 0 || !primaryTf || primaryTf.insufficient) {
    cautions.push("Not enough closed bars on the selected timeframe to form a signal.");
  } else if (combined >= 25 && agreement >= 0.6 && (anchor == null || anchor.score > -20)) {
    signal = "BUY";
  } else if (combined <= -25 && agreement >= 0.6 && (anchor == null || anchor.score < 20)) {
    signal = "SELL";
  } else {
    if (Math.abs(combined) >= 25 && agreement < 0.6) cautions.push("Timeframes disagree on direction — waiting for alignment.");
    if (anchor && combined >= 25 && anchor.score <= -20) cautions.push(`Higher-timeframe (${anchor.interval}) trend is bearish; not buying against it.`);
    if (anchor && combined <= -25 && anchor.score >= 20) cautions.push(`Higher-timeframe (${anchor.interval}) trend is bullish; not selling against it.`);
    if (Math.abs(combined) < 25) cautions.push("Evidence is mixed or weak; no edge on either side.");
  }

  // Market regime: a correction vetoes new longs; pressure damps them.
  let vetoed: SignalReport["vetoed"] = null;
  if (market && signal === "BUY") {
    if (market.posture === "correction" || market.exposureCeilingPct <= 0) {
      vetoed = { signal: "BUY", reason: `market regime "${market.posture}" (exposure ceiling ${market.exposureCeilingPct}%)` };
      signal = "HOLD";
      cautions.push(`BUY vetoed: market regime is "${market.posture}" (exposure ceiling ${market.exposureCeilingPct}%) — new longs are low-probability. ${market.headline}`);
    } else if (market.posture !== "confirmed-uptrend") {
      cautions.push(`Market regime "${market.posture}": keep long exposure ≤ ${market.exposureCeilingPct}% of capital and prefer the strongest setups.`);
    }
  }
  if (tt && signal === "BUY" && tt.verdict === "no") {
    cautions.push(`Daily trend template: only ${tt.passed}/${tt.total} Minervini checks pass — not a Stage 2 uptrend; this is a counter-trend or early-stage long.`);
  }

  let confidence = Math.min(100, Math.abs(combined)) * 0.6 + agreement * 100 * 0.4;
  if (market && signal === "BUY" && market.posture !== "confirmed-uptrend") confidence *= 0.85;
  if (vetoed) confidence *= 0.5;
  if (tt && signal === "BUY" && tt.verdict === "no") confidence *= 0.9;
  if (quality.status === "stale") { confidence *= 0.5; cautions.push("Data is stale (providers failed); confidence halved."); }
  if (quality.status === "delayed") { confidence *= 0.8; cautions.push("Data is delayed; the latest bars may have moved on."); }
  if (quality.status === "closed") { confidence *= 0.9; cautions.push("Market is closed; signal is based on the last completed session and will be re-evaluated at the open."); }
  if (quality.lastBarForming) cautions.push("The current bar is still forming and is excluded from the score to avoid repainting.");
  for (const t of usable) for (const c of t.cautions) cautions.push(`${t.interval}: ${c}`);
  confidence = Math.round(clamp(confidence, 0, 95));
  const confidenceLabel = confidence >= 65 ? "high" : confidence >= 40 ? "moderate" : "low";

  // Reasons: the strongest factors on the primary timeframe plus the anchor's trend.
  const reasons: string[] = [];
  if (primaryTf && !primaryTf.insufficient) {
    const sorted = [...primaryTf.factors].sort((x, y) => Math.abs(y.score) - Math.abs(x.score));
    for (const f of sorted.slice(0, 6)) {
      if (f.score === 0 && f.group !== "volume") continue;
      reasons.push(`${primary} ${f.label}: ${f.detail}`);
    }
  }
  for (const t of usable) {
    if (t.interval === primary) continue;
    reasons.push(`${t.interval}: score ${t.score > 0 ? "+" : ""}${t.score}, ${t.trend} structure, RSI ${fmt(t.indicators.rsi14, 0)}, MACD ${t.indicators.macdHist != null && t.indicators.macdHist > 0 ? "bullish" : "bearish"}.`);
  }

  // Trade plan on the primary timeframe (only when there is a signal).
  let plan: TradePlan | null = null;
  const sup = primaryTf?.levels.filter((l) => l.kind === "support").at(-1)?.price ?? null;
  const res = primaryTf?.levels.find((l) => l.kind === "resistance")?.price ?? null;
  if (primaryTf && !primaryTf.insufficient && signal !== "HOLD" && primaryTf.indicators.atr14) {
    const a = primaryTf.indicators.atr14;
    const close = primaryTf.indicators.close;
    const long = signal === "BUY";
    let stop: number;
    let stopNote: string;
    if (long) {
      const cand = sup != null && close - sup <= 3 * a && close - sup >= 0.5 * a ? sup - 0.25 * a : close - 1.5 * a;
      stop = cand;
      stopNote = sup != null && stop < sup ? `Below support ${fmt(sup)} by 0.25 ATR.` : "1.5 × ATR below entry.";
    } else {
      const cand = res != null && res - close <= 3 * a && res - close >= 0.5 * a ? res + 0.25 * a : close + 1.5 * a;
      stop = cand;
      stopNote = res != null && stop > res ? `Above resistance ${fmt(res)} by 0.25 ATR.` : "1.5 × ATR above entry.";
    }
    const risk = Math.abs(close - stop);
    let t1: number;
    let t2: number;
    let targetNote: string;
    if (long) {
      t1 = res != null && res - close >= 1 * risk ? res : close + 1.5 * risk;
      targetNote = res != null && t1 === res ? `T1 at resistance ${fmt(res)}; ` : "T1 at 1.5 R; ";
      t2 = Math.max(close + 2.5 * risk, t1 + 0.5 * risk);
      targetNote += "T2 at 2.5 R.";
    } else {
      t1 = sup != null && close - sup >= 1 * risk ? sup : close - 1.5 * risk;
      targetNote = sup != null && t1 === sup ? `T1 at support ${fmt(sup)}; ` : "T1 at 1.5 R; ";
      t2 = Math.min(close - 2.5 * risk, t1 - 0.5 * risk);
      targetNote += "T2 at 2.5 R.";
    }
    plan = {
      direction: long ? "long" : "short",
      entry: round2(close),
      entryNote: `Last closed ${primary} bar close${primaryTf.indicators.ema20 != null ? `; a pullback toward EMA20 ${fmt(primaryTf.indicators.ema20)} improves the ratio` : ""}.`,
      stop: round2(stop),
      stopNote,
      target1: round2(t1),
      target2: round2(t2),
      targetNote,
      riskPerShare: round2(risk),
      rewardRiskT1: Math.round((Math.abs(t1 - close) / risk) * 100) / 100,
      rewardRiskT2: Math.round((Math.abs(t2 - close) / risk) * 100) / 100,
      atr: round2(a),
      basisInterval: primary,
    };
    if (plan.rewardRiskT1 < 1) cautions.push(`Reward:risk to T1 is only ${plan.rewardRiskT1}; the nearest level caps the move.`);
  }

  return {
    signal,
    confidence,
    confidenceLabel,
    combinedScore: Math.round(combined),
    agreement: Math.round(agreement * 100) / 100,
    primary,
    weights,
    timeframes: tfs,
    plan,
    levelsToWatch: { support: sup != null ? round2(sup) : null, resistance: res != null ? round2(res) : null },
    reasons,
    cautions: [...new Set(cautions)],
    market,
    trendTemplate: tt,
    vetoed,
    disclaimer: DISCLAIMER,
  };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** Convenience: score the latest *closed* bar of a series. */
export function scoreLatest(s: Series, lastBarForming: boolean): TimeframeScore {
  const i = Math.max(0, s.bars.length - 1 - (lastBarForming ? 1 : 0));
  return scoreAt(s, i);
}
