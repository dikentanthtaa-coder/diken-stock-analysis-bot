// Candlestick pattern recognition. Pure functions over OHLC arrays (oldest
// first). Each detector looks only at bars up to and including `i`, so the
// same code is lookahead-free in backtests.
//
// Thresholds follow common textbook definitions (Nison / Bulkowski-style
// ratios). Context (prior trend) is derived from the slope of a short EMA
// of closes over the preceding bars, which the detectors require for
// reversal patterns.

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PatternDirection = "bullish" | "bearish" | "neutral";

export interface PatternHit {
  name: string;
  direction: PatternDirection;
  /** Index of the last bar of the pattern. */
  index: number;
  /** Number of bars the pattern spans. */
  bars: number;
  /** 1 = weak/common, 2 = moderate, 3 = strong multi-bar reversal. */
  strength: 1 | 2 | 3;
  description: string;
}

const body = (c: OHLC) => Math.abs(c.close - c.open);
const range = (c: OHLC) => c.high - c.low;
const upperWick = (c: OHLC) => c.high - Math.max(c.open, c.close);
const lowerWick = (c: OHLC) => Math.min(c.open, c.close) - c.low;
const isUp = (c: OHLC) => c.close > c.open;
const isDown = (c: OHLC) => c.close < c.open;

/** Average body size of the `n` bars before `i` (context for "long"/"short"). */
function avgBody(cs: OHLC[], i: number, n = 10): number {
  let s = 0;
  let k = 0;
  for (let j = Math.max(0, i - n); j < i; j++) {
    s += body(cs[j]);
    k++;
  }
  return k ? s / k : 0;
}

/** Prior trend before bar `i` using the close `lookback` bars earlier
 *  relative to the typical range: "down" if price fell meaningfully, "up"
 *  if it rose, else "flat". Reversal patterns need an opposing trend. */
export function priorTrend(cs: OHLC[], i: number, lookback = 6): "up" | "down" | "flat" {
  if (i - lookback < 0) return "flat";
  const start = cs[i - lookback].close;
  const end = cs[i - 1].close;
  let avgRange = 0;
  for (let j = i - lookback; j < i; j++) avgRange += range(cs[j]);
  avgRange /= lookback;
  if (avgRange <= 0) return "flat";
  const move = (end - start) / avgRange;
  if (move <= -1.0) return "down";
  if (move >= 1.0) return "up";
  return "flat";
}

/** Detect patterns ending at bar `i`. */
export function detectPatternsAt(cs: OHLC[], i: number): PatternHit[] {
  const hits: PatternHit[] = [];
  if (i < 1 || i >= cs.length) return hits;
  const c = cs[i];
  const r = range(c);
  if (r <= 0) return hits;
  const b = body(c);
  const ab = avgBody(cs, i);
  const trend = priorTrend(cs, i);
  const p1 = cs[i - 1];
  const p2 = i >= 2 ? cs[i - 2] : null;

  // ---- single-bar ----
  if (b / r <= 0.1) {
    const uw = upperWick(c), lw = lowerWick(c);
    if (lw / r >= 0.6 && uw / r <= 0.1) {
      hits.push({ name: "Dragonfly Doji", direction: trend === "down" ? "bullish" : "neutral", index: i, bars: 1, strength: 1,
        description: "Open≈close at the top of the range with a long lower shadow: sellers were rejected." });
    } else if (uw / r >= 0.6 && lw / r <= 0.1) {
      hits.push({ name: "Gravestone Doji", direction: trend === "up" ? "bearish" : "neutral", index: i, bars: 1, strength: 1,
        description: "Open≈close at the bottom of the range with a long upper shadow: buyers were rejected." });
    } else {
      hits.push({ name: "Doji", direction: "neutral", index: i, bars: 1, strength: 1,
        description: "Open≈close: indecision; needs the next bar to confirm direction." });
    }
  } else {
    const uw = upperWick(c), lw = lowerWick(c);
    // Hammer / Hanging Man: small body at the top, lower shadow ≥ 2× body, tiny upper shadow.
    if (lw >= 2 * b && uw <= b * 0.5 && b / r <= 0.35) {
      if (trend === "down") {
        hits.push({ name: "Hammer", direction: "bullish", index: i, bars: 1, strength: 2,
          description: `Lower shadow ${(lw / b).toFixed(1)}× the body after a decline: dip was bought.` });
      } else if (trend === "up") {
        hits.push({ name: "Hanging Man", direction: "bearish", index: i, bars: 1, strength: 1,
          description: "Hammer shape after a rise: a warning that supply appeared intraday." });
      }
    }
    // Inverted Hammer / Shooting Star: small body at the bottom, upper shadow ≥ 2× body.
    if (uw >= 2 * b && lw <= b * 0.5 && b / r <= 0.35) {
      if (trend === "up") {
        hits.push({ name: "Shooting Star", direction: "bearish", index: i, bars: 1, strength: 2,
          description: `Upper shadow ${(uw / b).toFixed(1)}× the body after a rise: rally was sold.` });
      } else if (trend === "down") {
        hits.push({ name: "Inverted Hammer", direction: "bullish", index: i, bars: 1, strength: 1,
          description: "Buyers probed higher after a decline; needs bullish confirmation." });
      }
    }
    // Marubozu: body ≥ 90% of the range.
    if (b / r >= 0.9 && ab > 0 && b >= 1.2 * ab) {
      hits.push({ name: isUp(c) ? "Bullish Marubozu" : "Bearish Marubozu", direction: isUp(c) ? "bullish" : "bearish",
        index: i, bars: 1, strength: 1, description: "Full-bodied bar with almost no shadows: one-sided conviction." });
    }
  }

  // ---- two-bar ----
  const pb = body(p1);
  if (pb > 0 && b > 0) {
    // Engulfing: opposite colours, current body engulfs previous body.
    if (isDown(p1) && isUp(c) && c.open <= p1.close && c.close >= p1.open && b > pb) {
      hits.push({ name: "Bullish Engulfing", direction: "bullish", index: i, bars: 2, strength: trend === "down" ? 3 : 2,
        description: `Green body engulfs the prior red body (${(b / pb).toFixed(1)}×)${trend === "down" ? " after a decline" : ""}.` });
    }
    if (isUp(p1) && isDown(c) && c.open >= p1.close && c.close <= p1.open && b > pb) {
      hits.push({ name: "Bearish Engulfing", direction: "bearish", index: i, bars: 2, strength: trend === "up" ? 3 : 2,
        description: `Red body engulfs the prior green body (${(b / pb).toFixed(1)}×)${trend === "up" ? " after a rise" : ""}.` });
    }
    // Harami: current small body inside previous large body.
    if (pb >= 1.2 * ab && b <= 0.5 * pb && Math.max(c.open, c.close) <= Math.max(p1.open, p1.close) && Math.min(c.open, c.close) >= Math.min(p1.open, p1.close)) {
      if (isDown(p1) && trend === "down") {
        hits.push({ name: "Bullish Harami", direction: "bullish", index: i, bars: 2, strength: 1,
          description: "Small body inside a large red bar: selling pressure paused." });
      } else if (isUp(p1) && trend === "up") {
        hits.push({ name: "Bearish Harami", direction: "bearish", index: i, bars: 2, strength: 1,
          description: "Small body inside a large green bar: buying pressure paused." });
      }
    }
    // Piercing Line / Dark Cloud Cover.
    if (isDown(p1) && isUp(c) && c.open < p1.low && c.close > (p1.open + p1.close) / 2 && c.close < p1.open && trend === "down") {
      hits.push({ name: "Piercing Line", direction: "bullish", index: i, bars: 2, strength: 2,
        description: "Gapped below the prior low and closed above the midpoint of the red bar." });
    }
    if (isUp(p1) && isDown(c) && c.open > p1.high && c.close < (p1.open + p1.close) / 2 && c.close > p1.open && trend === "up") {
      hits.push({ name: "Dark Cloud Cover", direction: "bearish", index: i, bars: 2, strength: 2,
        description: "Gapped above the prior high and closed below the midpoint of the green bar." });
    }
    // Tweezers.
    const tol = 0.001 * c.close;
    if (Math.abs(c.low - p1.low) <= tol && trend === "down" && isDown(p1) && isUp(c)) {
      hits.push({ name: "Tweezer Bottom", direction: "bullish", index: i, bars: 2, strength: 1,
        description: "Two bars share the same low after a decline." });
    }
    if (Math.abs(c.high - p1.high) <= tol && trend === "up" && isUp(p1) && isDown(c)) {
      hits.push({ name: "Tweezer Top", direction: "bearish", index: i, bars: 2, strength: 1,
        description: "Two bars share the same high after a rise." });
    }
  }

  // ---- three-bar ----
  if (p2) {
    const b2 = body(p2);
    const trend3 = priorTrend(cs, i - 2);
    // Morning Star: long red, small body gapping/closing lower, long green closing into the first body.
    if (isDown(p2) && b2 >= 1.0 * ab && pb <= 0.5 * b2 && isUp(c) && b >= 0.8 * b2 && c.close > (p2.open + p2.close) / 2 && trend3 === "down") {
      hits.push({ name: "Morning Star", direction: "bullish", index: i, bars: 3, strength: 3,
        description: "Long red bar, indecision bar, then a long green bar reclaiming the midpoint: three-bar bottom." });
    }
    // Evening Star.
    if (isUp(p2) && b2 >= 1.0 * ab && pb <= 0.5 * b2 && isDown(c) && b >= 0.8 * b2 && c.close < (p2.open + p2.close) / 2 && trend3 === "up") {
      hits.push({ name: "Evening Star", direction: "bearish", index: i, bars: 3, strength: 3,
        description: "Long green bar, indecision bar, then a long red bar losing the midpoint: three-bar top." });
    }
    // Three White Soldiers / Three Black Crows: three consecutive strong bars closing progressively higher/lower.
    const strong = (x: OHLC) => body(x) / Math.max(range(x), 1e-9) >= 0.5 && body(x) >= 0.6 * ab;
    if (isUp(p2) && isUp(p1) && isUp(c) && strong(p2) && strong(p1) && strong(c) && p1.close > p2.close && c.close > p1.close && p1.open > p2.open && c.open > p1.open) {
      hits.push({ name: "Three White Soldiers", direction: "bullish", index: i, bars: 3, strength: 2,
        description: "Three consecutive strong green bars with higher opens and closes." });
    }
    if (isDown(p2) && isDown(p1) && isDown(c) && strong(p2) && strong(p1) && strong(c) && p1.close < p2.close && c.close < p1.close && p1.open < p2.open && c.open < p1.open) {
      hits.push({ name: "Three Black Crows", direction: "bearish", index: i, bars: 3, strength: 2,
        description: "Three consecutive strong red bars with lower opens and closes." });
    }
  }

  return hits;
}

/** Patterns completing within the last `recentBars` bars of the series. */
export function detectRecentPatterns(cs: OHLC[], recentBars = 3): PatternHit[] {
  const out: PatternHit[] = [];
  for (let i = Math.max(1, cs.length - recentBars); i < cs.length; i++) {
    out.push(...detectPatternsAt(cs, i));
  }
  return out;
}
