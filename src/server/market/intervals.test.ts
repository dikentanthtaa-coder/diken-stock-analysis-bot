import { describe, it, expect } from "vitest";
import { resampleTo4h, isOnGrid, marketStateIST, ladderFor, sessionOpenTs, istMinuteOfDay } from "./intervals";
import { parseYahooChart } from "./yahoo-parse";

// 2026-10-13 09:15 IST = 03:45 UTC
const OPEN = Date.UTC(2026, 9, 13, 3, 45) / 1000;

describe("session helpers", () => {
  it("finds the session open and IST minutes", () => {
    expect(sessionOpenTs(OPEN + 3600)).toBe(OPEN);
    expect(istMinuteOfDay(OPEN)).toBe(9 * 60 + 15);
  });
  it("reports market state by IST clock", () => {
    expect(marketStateIST(OPEN + 60)).toBe("open");
    expect(marketStateIST(OPEN + 6.25 * 3600)).toBe("closed"); // 15:30
    expect(marketStateIST(OPEN - 10 * 60)).toBe("pre-open"); // 09:05
    const sat = Date.UTC(2026, 9, 17, 5, 0) / 1000;
    expect(marketStateIST(sat)).toBe("closed");
  });
  it("builds ladders ending at daily", () => {
    expect(ladderFor("5m")).toEqual(["5m", "15m", "1h", "1d"]);
    expect(ladderFor("1h")).toEqual(["1h", "4h", "1d"]);
    expect(ladderFor("1d")).toEqual(["1d"]);
  });
  it("filters off-grid bars", () => {
    expect(isOnGrid(OPEN + 300, "5m")).toBe(true);
    expect(isOnGrid(OPEN + 343, "5m")).toBe(false);
    expect(isOnGrid(OPEN + 3600, "1h")).toBe(true);
  });
});

describe("resampleTo4h", () => {
  it("anchors buckets at 09:15 and 13:15 IST", () => {
    const bars = Array.from({ length: 7 }, (_, k) => ({
      time: OPEN + k * 3600,
      open: 100 + k, high: 101 + k, low: 99 + k, close: 100.5 + k, volume: 10,
    }));
    const out = resampleTo4h(bars);
    expect(out).toHaveLength(2);
    expect(out[0].time).toBe(OPEN);
    expect(out[0].open).toBe(100);
    expect(out[0].high).toBe(104); // bars k=0..3
    expect(out[0].close).toBe(103.5);
    expect(out[0].volume).toBe(40);
    expect(out[1].time).toBe(OPEN + 4 * 3600);
    expect(out[1].volume).toBe(30);
  });
});

describe("parseYahooChart", () => {
  it("drops the off-grid current-tick pseudo-bar and flags a forming bar", () => {
    const body = {
      chart: {
        result: [
          {
            meta: { regularMarketPrice: 1165.7, regularMarketTime: OPEN + 343, currency: "INR" },
            timestamp: [OPEN, OPEN + 300, OPEN + 343],
            indicators: { quote: [{
              open: [1160, 1162, 1165.7], high: [1163, 1166, 1165.7], low: [1159, 1161, 1165.7],
              close: [1162, 1165.699951, 1165.7], volume: [1000, 2000, 0],
            }] },
          },
        ],
        error: null,
      },
    };
    const p = parseYahooChart(body, "5m", OPEN + 343);
    expect("error" in p).toBe(false);
    if ("error" in p) return;
    expect(p.bars).toHaveLength(2);
    expect(p.dropped).toBe(1);
    expect(p.bars[1].close).toBe(1165.7);
    expect(p.lastBarForming).toBe(true);
    expect(p.quote.lastPrice).toBe(1165.7);
    const later = parseYahooChart(body, "5m", OPEN + 600);
    expect("error" in later ? null : later.lastBarForming).toBe(false);
  });
  it("returns the Yahoo error description", () => {
    const p = parseYahooChart({ chart: { result: undefined, error: { description: "No data found" } } }, "5m", 0);
    expect(p).toEqual({ error: "No data found" });
  });
});
