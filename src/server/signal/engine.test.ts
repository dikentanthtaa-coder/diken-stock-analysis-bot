import { describe, it, expect } from "vitest";
import { buildSeries, scoreAt, combineSignals, scoreLatest } from "./engine";
import { computeSignalTrades, DEFAULT_SIGNAL_PARAMS } from "@/server/backtest/signal";
import type { Bar } from "@/server/market/intervals";

const OPEN = Date.UTC(2026, 9, 13, 3, 45) / 1000;

/** Deterministic pseudo-random walk with drift; seeded LCG. */
function walk(n: number, drift: number, vol: number, seed = 7, start = 100): Bar[] {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) - 0.5;
  const out: Bar[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(1, open * (1 + drift + rnd() * vol));
    const high = Math.max(open, close) * (1 + Math.abs(rnd()) * vol * 0.5);
    const low = Math.min(open, close) * (1 - Math.abs(rnd()) * vol * 0.5);
    out.push({ time: OPEN + i * 300, open, high, low, close, volume: 1000 + Math.round(Math.abs(rnd()) * 500) });
    price = close;
  }
  return out;
}

describe("scoreAt", () => {
  it("is bullish on a persistent uptrend and bearish on a downtrend", () => {
    const up = buildSeries(walk(300, 0.002, 0.004), "5m");
    const dn = buildSeries(walk(300, -0.002, 0.004, 11), "5m");
    const su = scoreAt(up, 299);
    const sd = scoreAt(dn, 299);
    expect(su.insufficient).toBe(false);
    expect(su.score).toBeGreaterThan(25);
    expect(sd.score).toBeLessThan(-25);
    expect(su.indicators.rsi14!).toBeGreaterThan(50);
    expect(sd.indicators.macd!).toBeLessThan(0);
  });
  it("marks short series as insufficient", () => {
    const s = buildSeries(walk(30, 0, 0.01), "5m");
    expect(scoreAt(s, 29).insufficient).toBe(true);
  });
  it("uses only bars up to i (no lookahead)", () => {
    const full = walk(300, 0.001, 0.01, 3);
    const a = scoreAt(buildSeries(full, "5m"), 200);
    const b = scoreAt(buildSeries(full.slice(0, 201), "5m"), 200);
    expect(a.score).toBe(b.score);
    expect(a.factors).toEqual(b.factors);
    expect(a.levels).toEqual(b.levels);
  });
  it("excludes a forming bar in scoreLatest", () => {
    const s = buildSeries(walk(300, 0.001, 0.01, 3), "5m");
    expect(scoreLatest(s, true).index).toBe(298);
    expect(scoreLatest(s, false).index).toBe(299);
  });
});

describe("combineSignals", () => {
  const q = { status: "live" as const, lastBarForming: false, primaryBars: 300 };
  it("returns BUY with a long plan when timeframes agree upward", () => {
    const tfs = (["5m", "15m", "1h", "1d"] as const).map((iv, k) =>
      scoreAt(buildSeries(walk(300, 0.002, 0.004, 7 + k), iv), 299),
    );
    const r = combineSignals(tfs, "5m", q);
    expect(r.signal).toBe("BUY");
    expect(r.plan?.direction).toBe("long");
    expect(r.plan!.stop).toBeLessThan(r.plan!.entry);
    expect(r.plan!.target1).toBeGreaterThan(r.plan!.entry);
    expect(r.plan!.target2).toBeGreaterThan(r.plan!.target1);
    expect(r.plan!.rewardRiskT1).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(40);
    expect(r.confidence).toBeLessThanOrEqual(95);
    expect(r.disclaimer).toMatch(/not the probability of profit/);
  });
  it("returns SELL with a short plan on agreement downward", () => {
    const tfs = (["5m", "15m", "1h", "1d"] as const).map((iv, k) =>
      scoreAt(buildSeries(walk(300, -0.002, 0.004, 11 + k), iv), 299),
    );
    const r = combineSignals(tfs, "5m", q);
    expect(r.signal).toBe("SELL");
    expect(r.plan?.direction).toBe("short");
    expect(r.plan!.stop).toBeGreaterThan(r.plan!.entry);
  });
  it("holds when the daily anchor opposes the lower timeframes", () => {
    const low = (["5m", "15m", "1h"] as const).map((iv, k) => scoreAt(buildSeries(walk(300, 0.002, 0.004, 7 + k), iv), 299));
    const daily = scoreAt(buildSeries(walk(300, -0.003, 0.004, 5), "1d"), 299);
    const r = combineSignals([...low, daily], "5m", q);
    expect(r.signal).toBe("HOLD");
    expect(r.cautions.join(" ")).toMatch(/Higher-timeframe/);
    expect(r.plan).toBeNull();
  });
  it("halves confidence on stale data", () => {
    const tfs = (["5m", "15m", "1h", "1d"] as const).map((iv, k) => scoreAt(buildSeries(walk(300, 0.002, 0.004, 7 + k), iv), 299));
    const live = combineSignals(tfs, "5m", q);
    const stale = combineSignals(tfs, "5m", { ...q, status: "stale" });
    expect(stale.confidence).toBeLessThanOrEqual(Math.ceil(live.confidence / 2));
  });
});

describe("signal backtest", () => {
  it("produces consistent trades with stop below entry for longs and no lookahead", () => {
    const bars = walk(600, 0.0005, 0.012, 21);
    const r = computeSignalTrades(bars, "5m", DEFAULT_SIGNAL_PARAMS);
    expect(r.barsScored).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.direction).toBe("long");
      expect(t.stop).toBeLessThan(t.entryPrice);
      expect(t.target).toBeGreaterThan(t.entryPrice);
      expect(t.bars).toBeGreaterThanOrEqual(0);
    }
    // Truncating the series after a trade's exit must not change that trade.
    if (r.trades.length > 1) {
      const cut = computeSignalTrades(bars.slice(0, 400), "5m", DEFAULT_SIGNAL_PARAMS);
      for (let k = 0; k < cut.trades.length - 1; k++) {
        expect(cut.trades[k]).toEqual(r.trades[k]);
      }
    }
  });
});

describe("anchor veto", () => {
  it("looks up only anchor bars closed before the primary bar time", async () => {
    const { buildAnchor, anchorScoreAt, computeSignalTrades } = await import("@/server/backtest/signal");
    const daily = walk(300, -0.004, 0.004, 5).map((b, i) => ({ ...b, time: OPEN + i * 86_400 }));
    const a = buildAnchor(daily, "1d");
    expect(a.closeTimes[0]).toBe(OPEN + 6.25 * 3600);
    // Before the first daily close: nothing known.
    expect(anchorScoreAt(a, OPEN + 3600)).toBeNull();
    // Just after day 250 closes: that day's score, not day 251's.
    const t = OPEN + 250 * 86_400 + 6.25 * 3600 + 1;
    expect(anchorScoreAt(a, t)).toBe(a.scores[250]);
    expect(a.scores[299]).toBeLessThan(-20);
    // A bearish daily anchor blocks longs from an uptrending intraday series.
    const intraday = walk(600, 0.002, 0.004, 7).map((b, i) => ({ ...b, time: OPEN + 100 * 86_400 + i * 300 }));
    const without = computeSignalTrades(intraday, "5m", DEFAULT_SIGNAL_PARAMS);
    const withVeto = computeSignalTrades(intraday, "5m", DEFAULT_SIGNAL_PARAMS, a);
    expect(without.trades.length).toBeGreaterThan(0);
    expect(withVeto.trades.length).toBe(0);
    expect(withVeto.vetoed).toBeGreaterThan(0);
  });
});
