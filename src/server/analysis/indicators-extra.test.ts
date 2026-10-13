import { describe, it, expect } from "vitest";
import { macd, bollinger, vwap, rollingVwap, ema } from "./indicators";

describe("macd", () => {
  it("equals EMA12 − EMA26 and starts the signal after 9 MACD values", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.2);
    const out = macd(closes);
    const e12 = ema(closes, 12);
    const e26 = ema(closes, 26);
    for (let i = 0; i < closes.length; i++) {
      if (i < 25) {
        expect(out[i].macd).toBeNull();
      } else {
        expect(out[i].macd).toBeCloseTo(e12[i]! - e26[i]!, 10);
      }
    }
    // First MACD value at index 25; signal needs 9 of them → index 33.
    expect(out[32].signal).toBeNull();
    expect(out[33].signal).not.toBeNull();
    const seed = out.slice(25, 34).reduce((a, p) => a + p.macd!, 0) / 9;
    expect(out[33].signal).toBeCloseTo(seed, 10);
    expect(out[34].histogram).toBeCloseTo(out[34].macd! - out[34].signal!, 10);
  });
  it("is positive when a rally accelerates and negative when a decline does", () => {
    const up = Array.from({ length: 80 }, (_, i) => 100 + i * i * 0.01);
    const down = Array.from({ length: 80 }, (_, i) => 200 - i * i * 0.01);
    expect(macd(up).at(-1)!.macd!).toBeGreaterThan(0);
    expect(macd(down).at(-1)!.macd!).toBeLessThan(0);
  });
});

describe("bollinger", () => {
  it("matches a hand-computed population standard deviation", () => {
    // 20 values: 1..20 → mean 10.5, population sd = sqrt(33.25) = 5.766281...
    const closes = Array.from({ length: 20 }, (_, i) => i + 1);
    const b = bollinger(closes, 20, 2)[19];
    expect(b.middle).toBeCloseTo(10.5, 10);
    const sd = Math.sqrt(33.25);
    expect(b.upper).toBeCloseTo(10.5 + 2 * sd, 10);
    expect(b.lower).toBeCloseTo(10.5 - 2 * sd, 10);
    expect(b.percentB).toBeCloseTo((20 - b.lower!) / (b.upper! - b.lower!), 10);
    expect(b.bandwidth).toBeCloseTo((4 * sd) / 10.5, 10);
    expect(bollinger(closes, 20, 2)[18].middle).toBeNull();
  });
  it("gives %B 0.5 for a flat series", () => {
    const b = bollinger(new Array(25).fill(50), 20, 2).at(-1)!;
    expect(b.percentB).toBe(0.5);
    expect(b.upper).toBe(50);
  });
});

describe("vwap", () => {
  it("weights typical price by volume and resets per session", () => {
    const bars = [
      { high: 12, low: 8, close: 10, volume: 100 }, // tp 10
      { high: 22, low: 18, close: 20, volume: 300 }, // tp 20
      { high: 32, low: 28, close: 30, volume: 100 }, // new session
    ];
    const out = vwap(bars, (i) => (i < 2 ? "d1" : "d2"));
    expect(out[0]).toBe(10);
    expect(out[1]).toBeCloseTo((10 * 100 + 20 * 300) / 400, 10);
    expect(out[2]).toBe(30);
  });
  it("rolling VWAP covers exactly the window", () => {
    const bars = Array.from({ length: 5 }, (_, i) => ({ high: i + 1, low: i + 1, close: i + 1, volume: 1 }));
    const out = rollingVwap(bars, 3);
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 10);
    expect(out[4]).toBeCloseTo(4, 10);
  });
});
