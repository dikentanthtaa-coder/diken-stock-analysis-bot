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
