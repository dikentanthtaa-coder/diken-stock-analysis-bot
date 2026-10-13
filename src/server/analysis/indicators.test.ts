import { describe, it, expect } from "vitest";
import {
  sma,
  rsi,
  atr,
  toWeekly,
  findSwings,
  classifyTrend,
  findLevels,
  detectBreakout,
  type Candle,
} from "./indicators";

function mk(date: string, close: number, spread = 2, volume = 1000): Candle {
  return {
    date,
    open: close - 1,
    high: close + spread,
    low: close - spread,
    close,
    volume,
  };
}

describe("sma", () => {
  it("computes simple moving average", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
});

describe("rsi", () => {
  it("is 100 for straight-up closes and low for straight-down", () => {
    const up = rsi(Array.from({ length: 20 }, (_, i) => 100 + i), 14);
    expect(up.at(-1)).toBe(100);
    const down = rsi(Array.from({ length: 20 }, (_, i) => 100 - i), 14);
    expect(down.at(-1)).toBe(0);
  });
});

describe("atr", () => {
  it("equals the constant true range for uniform candles", () => {
    const candles = Array.from({ length: 20 }, (_, i) =>
      mk(`2026-01-${String(i + 1).padStart(2, "0")}`, 100, 3),
    );
    const a = atr(candles, 14);
    expect(a.at(-1)).toBeCloseTo(6, 5); // high-low = 2*spread
  });
});

describe("toWeekly", () => {
  it("aggregates a Mon-Fri run into one weekly candle", () => {
    // 2026-01-05 is a Monday.
    const days = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
    const candles = days.map((d, i) => mk(d, 100 + i));
    const weekly = toWeekly(candles);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].close).toBe(104);
    expect(weekly[0].volume).toBe(5000);
    expect(weekly[0].high).toBe(104 + 2);
    expect(weekly[0].low).toBe(100 - 2);
  });
});

describe("swings + trend", () => {
  it("detects uptrend from higher highs and higher lows", () => {
    // Zig-zag upward: lows 100,110,120; highs 115,125,135.
    const closes = [100, 108, 115, 108, 110, 118, 125, 118, 120, 128, 135, 128, 130];
    const candles = closes.map((c, i) =>
      mk(`2026-02-${String(i + 1).padStart(2, "0")}`, c, 1),
    );
    const swings = findSwings(candles, 2);
    const { trend } = classifyTrend(swings);
    expect(trend).toBe("uptrend");
  });
});

describe("levels + breakout", () => {
  it("clusters repeated highs into resistance and detects breakout", () => {
    // Price bounces between ~100 and ~120 twice, then breaks above 120.
    const closes = [100, 105, 100, 110, 120, 110, 100, 110, 120, 110, 100, 112, 125, 127, 128];
    const candles = closes.map((c, i) =>
      mk(`2026-03-${String(i + 1).padStart(2, "0")}`, c, 1),
    );
    const swings = findSwings(candles, 2);
    const levels = findLevels(swings, 128);
    expect(levels.length).toBeGreaterThan(0);
    const b = detectBreakout(candles, levels, 10);
    expect(["breakout", "retest"]).toContain(b.state);
  });
});
