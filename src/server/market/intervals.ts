// Timeframe definitions and session-aware helpers for intraday data.
// Pure module (no IO, no "server-only") so it is unit-testable and can be
// imported by both the server and the client for labels.

export const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

export interface IntervalSpec {
  seconds: number;
  label: string;
  /** How long a server-side cache entry stays fresh (ms). */
  cacheTtlMs: number;
  /** How often the browser should poll while the market is open (ms). */
  pollMs: number;
  /** Minimum closed bars needed for a meaningful indicator set. */
  minBars: number;
}

export const INTERVAL_SPEC: Record<Interval, IntervalSpec> = {
  "1m": { seconds: 60, label: "1 min", cacheTtlMs: 15_000, pollMs: 20_000, minBars: 60 },
  "5m": { seconds: 300, label: "5 min", cacheTtlMs: 30_000, pollMs: 30_000, minBars: 60 },
  "15m": { seconds: 900, label: "15 min", cacheTtlMs: 60_000, pollMs: 60_000, minBars: 60 },
  "1h": { seconds: 3600, label: "1 hour", cacheTtlMs: 120_000, pollMs: 120_000, minBars: 60 },
  "4h": { seconds: 14_400, label: "4 hour", cacheTtlMs: 180_000, pollMs: 180_000, minBars: 40 },
  "1d": { seconds: 86_400, label: "Daily", cacheTtlMs: 300_000, pollMs: 300_000, minBars: 60 },
};

export function isInterval(v: unknown): v is Interval {
  return typeof v === "string" && (INTERVALS as readonly string[]).includes(v);
}

/** Timeframes analysed together for a given primary interval: the primary,
 *  up to two higher ones, and the daily chart as the trend anchor. */
export function ladderFor(primary: Interval): Interval[] {
  const i = INTERVALS.indexOf(primary);
  const out: Interval[] = [primary];
  for (let k = i + 1; k < INTERVALS.length && out.length < 3; k++) out.push(INTERVALS[k]);
  if (!out.includes("1d")) out.push("1d");
  return out;
}

/* ---------- NSE/BSE session (IST) ---------- */

export const IST_OFFSET_SEC = 5.5 * 3600;
export const SESSION_OPEN_MIN = 9 * 60 + 15; // 09:15 IST
export const SESSION_CLOSE_MIN = 15 * 60 + 30; // 15:30 IST

/** Minutes since IST midnight for a unix-seconds timestamp. */
export function istMinuteOfDay(ts: number): number {
  const s = ((ts + IST_OFFSET_SEC) % 86_400 + 86_400) % 86_400;
  return Math.floor(s / 60);
}

/** IST calendar day (YYYY-MM-DD) for a unix-seconds timestamp. */
export function istDay(ts: number): string {
  return new Date((ts + IST_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

/** Unix seconds of the session open on the IST day containing `ts`. */
export function sessionOpenTs(ts: number): number {
  const istMidnight = Math.floor((ts + IST_OFFSET_SEC) / 86_400) * 86_400 - IST_OFFSET_SEC;
  return istMidnight + SESSION_OPEN_MIN * 60;
}

export type MarketState = "open" | "closed" | "pre-open" | "unknown";

/** Regular-hours state from the clock alone. Exchange holidays are not
 *  known here, so a weekday outside a holiday calendar may read "open"
 *  while the exchange is shut — callers must also check data freshness. */
export function marketStateIST(nowSec = Math.floor(Date.now() / 1000)): MarketState {
  const istDate = new Date((nowSec + IST_OFFSET_SEC) * 1000);
  const dow = istDate.getUTCDay();
  if (dow === 0 || dow === 6) return "closed";
  const m = istMinuteOfDay(nowSec);
  if (m >= SESSION_OPEN_MIN && m < SESSION_CLOSE_MIN) return "open";
  if (m >= 9 * 60 && m < SESSION_OPEN_MIN) return "pre-open";
  return "closed";
}

/* ---------- resampling ---------- */

export interface Bar {
  time: number; // unix seconds, bar open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Aggregate finer bars into 4-hour bars anchored at the session open, so a
 *  trading day yields 09:15–13:15 and 13:15–15:30 bars. */
export function resampleTo4h(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let curKey = "";
  for (const b of bars) {
    const open = sessionOpenTs(b.time);
    const bucket = Math.max(0, Math.floor((b.time - open) / 14_400));
    const key = `${istDay(b.time)}#${bucket}`;
    if (!cur || key !== curKey) {
      if (cur) out.push(cur);
      cur = { time: open + bucket * 14_400, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      curKey = key;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Aggregate daily bars into ISO weeks (Monday-anchored). */
export function resampleToWeekly(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null;
  let curKey = "";
  for (const b of bars) {
    const d = new Date((b.time + IST_OFFSET_SEC) * 1000);
    const dow = d.getUTCDay() || 7;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - dow + 1);
    const key = monday.toISOString().slice(0, 10);
    if (!cur || key !== curKey) {
      if (cur) out.push(cur);
      cur = { time: Math.floor(monday.getTime() / 1000) - IST_OFFSET_SEC, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      curKey = key;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Is `ts` on the interval grid for intraday bars (relative to the session
 *  open) or on a day boundary for daily bars? Yahoo appends an off-grid
 *  "current tick" pseudo-bar during the session; this filters it out. */
export function isOnGrid(ts: number, interval: Interval): boolean {
  if (interval === "1d") return true;
  const spec = INTERVAL_SPEC[interval];
  const offset = ts - sessionOpenTs(ts);
  return offset >= 0 && offset % spec.seconds === 0;
}
