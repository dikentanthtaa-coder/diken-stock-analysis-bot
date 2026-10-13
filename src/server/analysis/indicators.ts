// Deterministic technical indicators and structure detection.
// Pure functions over candle arrays (oldest first). No IO, no AI.

export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[i] = prev;
    } else if (prev != null) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.open;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
    if (i === 0) {
      prev = tr;
    } else if (i < period) {
      prev = (prev! * i + tr) / (i + 1);
    } else {
      prev = (prev! * (period - 1) + tr) / period;
    }
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

/** Resample daily candles into weekly (ISO week, Mon-Sun). */
export function toWeekly(candles: Candle[]): Candle[] {
  const weeks = new Map<string, Candle>();
  for (const c of candles) {
    const d = new Date(c.date + "T00:00:00Z");
    // ISO week key: year + week number of the Monday.
    const day = d.getUTCDay() || 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - day + 1);
    const key = monday.toISOString().slice(0, 10);
    const w = weeks.get(key);
    if (!w) {
      weeks.set(key, { ...c, date: key });
    } else {
      w.high = Math.max(w.high, c.high);
      w.low = Math.min(w.low, c.low);
      w.close = c.close;
      w.volume += c.volume;
    }
  }
  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface SwingPoint {
  index: number;
  date: string;
  price: number;
  kind: "high" | "low";
}

/** Fractal swing detection: a high/low flanked by `span` lower highs /
 *  higher lows on each side. */
export function findSwings(candles: Candle[], span = 2): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = span; i < candles.length - span; i++) {
    const highs = candles.slice(i - span, i + span + 1).map((c) => c.high);
    const lows = candles.slice(i - span, i + span + 1).map((c) => c.low);
    if (candles[i].high === Math.max(...highs)) {
      out.push({ index: i, date: candles[i].date, price: candles[i].high, kind: "high" });
    } else if (candles[i].low === Math.min(...lows)) {
      out.push({ index: i, date: candles[i].date, price: candles[i].low, kind: "low" });
    }
  }
  return out;
}

export type Trend = "uptrend" | "downtrend" | "sideways";

/** Classify trend from the last few swing highs/lows (market structure). */
export function classifyTrend(swings: SwingPoint[]): {
  trend: Trend;
  evidence: string;
} {
  const highs = swings.filter((s) => s.kind === "high").slice(-3);
  const lows = swings.filter((s) => s.kind === "low").slice(-3);
  if (highs.length < 2 || lows.length < 2) {
    return { trend: "sideways", evidence: "Not enough swing points to judge structure." };
  }
  const hh = highs.at(-1)!.price > highs.at(-2)!.price;
  const hl = lows.at(-1)!.price > lows.at(-2)!.price;
  const lh = highs.at(-1)!.price < highs.at(-2)!.price;
  const ll = lows.at(-1)!.price < lows.at(-2)!.price;
  if (hh && hl) {
    return {
      trend: "uptrend",
      evidence: `Higher high (${highs.at(-2)!.price.toFixed(2)} → ${highs.at(-1)!.price.toFixed(2)}) and higher low (${lows.at(-2)!.price.toFixed(2)} → ${lows.at(-1)!.price.toFixed(2)}).`,
    };
  }
  if (lh && ll) {
    return {
      trend: "downtrend",
      evidence: `Lower high (${highs.at(-2)!.price.toFixed(2)} → ${highs.at(-1)!.price.toFixed(2)}) and lower low (${lows.at(-2)!.price.toFixed(2)} → ${lows.at(-1)!.price.toFixed(2)}).`,
    };
  }
  return {
    trend: "sideways",
    evidence: "Mixed structure: no clean sequence of higher or lower swings.",
  };
}

export interface Level {
  price: number;
  touches: number;
  kind: "support" | "resistance";
  lastTouch: string;
}

/** Cluster swing points into horizontal S/R levels within a tolerance. */
export function findLevels(
  swings: SwingPoint[],
  lastClose: number,
  tolerancePct = 1.5,
): Level[] {
  const clusters: { prices: number[]; dates: string[]; kinds: ("high" | "low")[] }[] = [];
  for (const s of swings) {
    const c = clusters.find(
      (cl) =>
        Math.abs(cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length - s.price) /
          s.price <
        tolerancePct / 100,
    );
    if (c) {
      c.prices.push(s.price);
      c.dates.push(s.date);
      c.kinds.push(s.kind);
    } else {
      clusters.push({ prices: [s.price], dates: [s.date], kinds: [s.kind] });
    }
  }
  return clusters
    .filter((c) => c.prices.length >= 2)
    .map((c) => {
      const price = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
      return {
        price,
        touches: c.prices.length,
        kind: (price < lastClose ? "support" : "resistance") as Level["kind"],
        lastTouch: [...c.dates].sort().at(-1)!,
      };
    })
    .sort((a, b) => a.price - b.price);
}

export interface BreakoutState {
  state: "none" | "breakout" | "breakdown" | "retest";
  level: number | null;
  detail: string;
}

/** Detect recent breakout/breakdown of a clustered level with optional retest. */
export function detectBreakout(
  candles: Candle[],
  levels: Level[],
  lookback = 10,
): BreakoutState {
  if (candles.length < lookback + 5 || levels.length === 0) {
    return { state: "none", level: null, detail: "Insufficient data or levels." };
  }
  const recent = candles.slice(-lookback);
  const last = candles.at(-1)!;
  for (const lvl of levels) {
    const crossedUp = recent.some(
      (c, i) => i > 0 && recent[i - 1].close <= lvl.price && c.close > lvl.price,
    );
    const crossedDown = recent.some(
      (c, i) => i > 0 && recent[i - 1].close >= lvl.price && c.close < lvl.price,
    );
    if (crossedUp && last.close > lvl.price) {
      const nearLevel = Math.abs(last.low - lvl.price) / lvl.price < 0.02;
      return nearLevel
        ? {
            state: "retest",
            level: lvl.price,
            detail: `Broke above ${lvl.price.toFixed(2)} (${lvl.touches} touches) and is now retesting it.`,
          }
        : {
            state: "breakout",
            level: lvl.price,
            detail: `Closed above resistance ${lvl.price.toFixed(2)} (${lvl.touches} touches) within last ${lookback} sessions.`,
          };
    }
    if (crossedDown && last.close < lvl.price) {
      return {
        state: "breakdown",
        level: lvl.price,
        detail: `Closed below support ${lvl.price.toFixed(2)} (${lvl.touches} touches) within last ${lookback} sessions.`,
      };
    }
  }
  return { state: "none", level: null, detail: "No recent level break." };
}

/** Volume confirmation: last candle volume vs 20-day average. */
export function volumeRead(candles: Candle[]): {
  ratio: number | null;
  detail: string;
} {
  if (candles.length < 21) return { ratio: null, detail: "Not enough volume history." };
  const last = candles.at(-1)!;
  const avg =
    candles.slice(-21, -1).reduce((a, c) => a + c.volume, 0) / 20;
  if (avg <= 0) return { ratio: null, detail: "No average volume." };
  const ratio = last.volume / avg;
  return {
    ratio,
    detail: `Last session volume is ${ratio.toFixed(2)}× the 20-day average.`,
  };
}

/* ---------- Added for live signals: MACD, Bollinger, VWAP ---------- */

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

/** MACD(fast, slow, signal) on closes. Signal line is an EMA of the MACD
 *  line seeded from the first `signalPeriod` MACD values. */
export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdPoint[] {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? fastE[i]! - slowE[i]! : null,
  );
  const out: MacdPoint[] = closes.map(() => ({ macd: null, signal: null, histogram: null }));
  const k = 2 / (signalPeriod + 1);
  let sig: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const m = line[i];
    if (m == null) continue;
    if (sig == null) {
      seed.push(m);
      if (seed.length === signalPeriod) {
        sig = seed.reduce((a, b) => a + b, 0) / signalPeriod;
        seed = [];
      }
    } else {
      sig = m * k + sig * (1 - k);
    }
    out[i] = { macd: m, signal: sig, histogram: sig == null ? null : m - sig };
  }
  return out;
}

export interface BollingerPoint {
  middle: number | null;
  upper: number | null;
  lower: number | null;
  /** (close − lower) / (upper − lower); 0 = at lower band, 1 = at upper. */
  percentB: number | null;
  /** (upper − lower) / middle — relative band width. */
  bandwidth: number | null;
}

/** Bollinger Bands with population standard deviation (the TradingView /
 *  Bollinger convention). */
export function bollinger(closes: number[], period = 20, mult = 2): BollingerPoint[] {
  const out: BollingerPoint[] = closes.map(() => ({
    middle: null, upper: null, lower: null, percentB: null, bandwidth: null,
  }));
  for (let i = period - 1; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1);
    const mean = win.reduce((a, b) => a + b, 0) / period;
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const upper = mean + mult * sd;
    const lower = mean - mult * sd;
    const width = upper - lower;
    out[i] = {
      middle: mean,
      upper,
      lower,
      percentB: width > 0 ? (closes[i] - lower) / width : 0.5,
      bandwidth: mean > 0 ? width / mean : null,
    };
  }
  return out;
}

/** Volume-weighted average price using typical price, reset whenever
 *  `sessionKey` changes (per trading day for intraday bars). For daily
 *  bars pass a constant key to get a cumulative/anchored VWAP, or a
 *  rolling key for a windowed one. */
export function vwap(
  candles: { high: number; low: number; close: number; volume: number }[],
  sessionKey: (index: number) => string,
): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let pv = 0;
  let vol = 0;
  let curKey = "";
  for (let i = 0; i < candles.length; i++) {
    const k = sessionKey(i);
    if (k !== curKey) {
      pv = 0;
      vol = 0;
      curKey = k;
    }
    const c = candles[i];
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    vol += c.volume;
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

/** Rolling VWAP over the last `period` bars (used on daily charts where a
 *  session reset is meaningless). */
export function rollingVwap(
  candles: { high: number; low: number; close: number; volume: number }[],
  period = 20,
): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let pv = 0;
    let vol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const c = candles[j];
      pv += ((c.high + c.low + c.close) / 3) * c.volume;
      vol += c.volume;
    }
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

/* ---------- Added for the discipline/regime work: ADX, Stochastic, OBV ---------- */

export interface AdxPoint {
  adx: number | null;
  plusDi: number | null;
  minusDi: number | null;
}

/** Wilder's ADX(period) with +DI / −DI. Uses Wilder smoothing (RMA). */
export function adx(candles: { high: number; low: number; close: number }[], period = 14): AdxPoint[] {
  const n = candles.length;
  const out: AdxPoint[] = candles.map(() => ({ adx: null, plusDi: null, minusDi: null }));
  if (n < period + 1) return out;
  let trS = 0, pdmS = 0, mdmS = 0;
  let dxSum = 0, dxCount = 0;
  let adxPrev: number | null = null;
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    const pdm = upMove > downMove && upMove > 0 ? upMove : 0;
    const mdm = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    if (i <= period) {
      trS += tr; pdmS += pdm; mdmS += mdm;
      if (i < period) continue;
    } else {
      trS = trS - trS / period + tr;
      pdmS = pdmS - pdmS / period + pdm;
      mdmS = mdmS - mdmS / period + mdm;
    }
    const plusDi = trS > 0 ? (100 * pdmS) / trS : 0;
    const minusDi = trS > 0 ? (100 * mdmS) / trS : 0;
    const sum = plusDi + minusDi;
    const dx = sum > 0 ? (100 * Math.abs(plusDi - minusDi)) / sum : 0;
    let adxVal: number | null = null;
    if (adxPrev == null) {
      dxSum += dx; dxCount++;
      if (dxCount === period) { adxPrev = dxSum / period; adxVal = adxPrev; }
    } else {
      adxPrev = (adxPrev * (period - 1) + dx) / period;
      adxVal = adxPrev;
    }
    out[i] = { adx: adxVal, plusDi, minusDi };
  }
  return out;
}

export interface StochPoint {
  k: number | null;
  d: number | null;
}

/** Stochastic oscillator: %K = (close − lowest low) / (highest high − lowest low)
 *  over `kPeriod`, %D = SMA(%K, dPeriod). */
export function stochastic(
  candles: { high: number; low: number; close: number }[],
  kPeriod = 14,
  dPeriod = 3,
): StochPoint[] {
  const k: (number | null)[] = candles.map(() => null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j].high);
      ll = Math.min(ll, candles[j].low);
    }
    k[i] = hh > ll ? ((candles[i].close - ll) / (hh - ll)) * 100 : 50;
  }
  const out: StochPoint[] = candles.map((_, i) => ({ k: k[i], d: null }));
  for (let i = kPeriod - 1 + dPeriod - 1; i < candles.length; i++) {
    let s = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) s += k[j]!;
    out[i].d = s / dPeriod;
  }
  return out;
}

/** On-balance volume (cumulative). */
export function obv(candles: { close: number; volume: number }[]): number[] {
  const out: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const d = candles[i].close - candles[i - 1].close;
    out[i] = out[i - 1] + (d > 0 ? candles[i].volume : d < 0 ? -candles[i].volume : 0);
  }
  return out;
}

/* ---------- Minervini trend template (daily bars) ---------- */

export interface TrendTemplateCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface TrendTemplate {
  passed: number;
  total: number;
  checks: TrendTemplateCheck[];
  /** Stage 2 (all pass), near-stage-2 (≥ 6), or not in a Stage 2 uptrend. */
  verdict: "stage2" | "near" | "no";
}

/** Mark Minervini's 8-point trend template evaluated on daily closes. */
export function trendTemplate(daily: { high: number; low: number; close: number }[]): TrendTemplate | null {
  const n = daily.length;
  if (n < 200) return null;
  const closes = daily.map((c) => c.close);
  const s50 = sma(closes, 50), s150 = sma(closes, 150), s200 = sma(closes, 200);
  const i = n - 1;
  const close = closes[i];
  const m50 = s50[i]!, m150 = s150[i]!, m200 = s200[i]!;
  const m200Ago = s200[i - 21]; // ~1 month
  const window = daily.slice(-252);
  const hi52 = Math.max(...window.map((c) => c.high));
  const lo52 = Math.min(...window.map((c) => c.low));
  const f = (v: number) => v.toFixed(2);
  const checks: TrendTemplateCheck[] = [
    { id: "above150_200", label: "Price above 150 & 200 DMA", pass: close > m150 && close > m200, detail: `Close ${f(close)} vs 150DMA ${f(m150)} / 200DMA ${f(m200)}.` },
    { id: "150over200", label: "150 DMA above 200 DMA", pass: m150 > m200, detail: `${f(m150)} vs ${f(m200)}.` },
    { id: "200rising", label: "200 DMA rising for ≥ 1 month", pass: m200Ago != null && m200 > m200Ago, detail: m200Ago != null ? `${f(m200Ago)} → ${f(m200)} over 21 sessions.` : "n/a" },
    { id: "50over150_200", label: "50 DMA above 150 & 200 DMA", pass: m50 > m150 && m50 > m200, detail: `50DMA ${f(m50)}.` },
    { id: "above50", label: "Price above 50 DMA", pass: close > m50, detail: `${f(close)} vs ${f(m50)}.` },
    { id: "off_low", label: "≥ 30% above 52-week low", pass: close >= lo52 * 1.3, detail: `${(((close - lo52) / lo52) * 100).toFixed(0)}% above ${f(lo52)}.` },
    { id: "near_high", label: "Within 25% of 52-week high", pass: close >= hi52 * 0.75, detail: `${(((hi52 - close) / hi52) * 100).toFixed(0)}% below ${f(hi52)}.` },
    { id: "rs_proxy", label: "Outperforming its own 6-month path (RS proxy)", pass: n > 126 && close > closes[i - 126] * 1.0, detail: n > 126 ? `${(((close / closes[i - 126]) - 1) * 100).toFixed(0)}% over 126 sessions (true RS rating needs a universe; this is a proxy).` : "n/a" },
  ];
  const passed = checks.filter((c) => c.pass).length;
  return { passed, total: checks.length, checks, verdict: passed === checks.length ? "stage2" : passed >= 6 ? "near" : "no" };
}
