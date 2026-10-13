import { describe, it, expect } from "vitest";
import { runBacktest, computeTrades, DEFAULT_PARAMS, type BacktestParams } from "./engine";
import type { Candle } from "@/server/analysis/indicators";

// SYNTHETIC test data (never shown in app views).
function flat(n: number, price = 100, start = 0): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    date: dateAt(start + i),
    open: price,
    high: price + 1,
    low: price - 1,
    close: price,
    volume: 1000,
  }));
}

function dateAt(i: number): string {
  const d = new Date(Date.UTC(2024, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

const P: BacktestParams = { ...DEFAULT_PARAMS, costPctPerSide: 0, slippagePct: 0 };

describe("runBacktest", () => {
  it("produces no trades on flat data (no breakout ever)", () => {
    const result = runBacktest(flat(300), P);
    for (const period of result.periods) {
      expect(period.tradeCount).toBe(0);
      expect(period.winRate).toBeNull();
    }
  });

  it("takes a breakout trade and wins when price keeps rising", () => {
    // 60 flat bars, then a high-volume breakout and a steady rally.
    const candles = flat(60);
    let price = 100;
    for (let i = 0; i < 40; i++) {
      price += 2;
      candles.push({
        date: dateAt(60 + i),
        open: price - 1,
        high: price + 1.5,
        low: price - 2,
        close: price,
        volume: i === 0 ? 5000 : 1500, // breakout bar has volume spike
      });
    }
    // Use the whole series as one period by checking the dev period result.
    const allTrades = computeTrades(candles, P);
    expect(allTrades.length).toBeGreaterThan(0);
    const t = allTrades[0];
    expect(t.exitReason).toBe("target");
    expect(t.netReturnPct).toBeGreaterThan(0);
    expect(t.rMultiple).toBeCloseTo(P.rewardMult, 0);
  });

  it("entry fills on the NEXT bar's open (no look-ahead)", () => {
    const candles = flat(60);
    let price = 100;
    for (let i = 0; i < 40; i++) {
      price += 2;
      candles.push({
        date: dateAt(60 + i),
        open: price - 1,
        high: price + 1.5,
        low: price - 2,
        close: price,
        volume: i === 0 ? 5000 : 1500,
      });
    }
    const t = computeTrades(candles, P)[0];
    // Signal bar is the first rally bar; entry must be a later date.
    expect(t.entryDate > dateAt(60)).toBe(true);
  });

  it("costs and slippage reduce net returns", () => {
    const mk = () => {
      const candles = flat(60);
      let price = 100;
      for (let i = 0; i < 40; i++) {
        price += 2;
        candles.push({
          date: dateAt(60 + i),
          open: price - 1,
          high: price + 1.5,
          low: price - 2,
          close: price,
          volume: i === 0 ? 5000 : 1500,
        });
      }
      return candles;
    };
    const free = computeTrades(mk(), P)[0];
    const costly = computeTrades(mk(), {
      ...P,
      costPctPerSide: 0.5,
      slippagePct: 0.2,
    })[0];
    expect(costly.netReturnPct).toBeLessThan(free.netReturnPct);
  });

  it("stop is honored and loses about 1R", () => {
    // Breakout then immediate crash.
    const candles = flat(60);
    candles.push({
      date: dateAt(60), open: 100, high: 112, low: 99, close: 111, volume: 9000,
    });
    candles.push({
      date: dateAt(61), open: 110, high: 110, low: 80, close: 82, volume: 3000,
    });
    for (let i = 0; i < 30; i++) {
      candles.push({
        date: dateAt(62 + i), open: 82, high: 83, low: 81, close: 82, volume: 1000,
      });
    }
    const t = computeTrades(candles, P)[0];
    expect(t).toBeDefined();
    expect(t.exitReason).toBe("stop");
    expect(t.rMultiple).toBeLessThan(0);
    expect(t.rMultiple).toBeGreaterThan(-1.6); // ~-1R, worse only via gaps
  });

  it("reports three periods with date ranges", () => {
    const result = runBacktest(flat(300), P);
    expect(result.periods.map((p) => p.label)).toEqual([
      "development",
      "validation",
      "out-of-sample",
    ]);
  });
});
