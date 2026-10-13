import { describe, it, expect } from "vitest";
import { detectPatternsAt, priorTrend, type OHLC } from "./patterns";

const bar = (o: number, h: number, l: number, c: number, v = 1000): OHLC => ({ open: o, high: h, low: l, close: c, volume: v });

/** A steady decline of `n` bars ending near `end`. */
function decline(n: number, end: number, step = 2): OHLC[] {
  const out: OHLC[] = [];
  for (let k = n; k > 0; k--) {
    const o = end + k * step + step;
    const c = end + k * step;
    out.push(bar(o, o + 0.5, c - 0.5, c));
  }
  return out;
}
function rally(n: number, end: number, step = 2): OHLC[] {
  const out: OHLC[] = [];
  for (let k = n; k > 0; k--) {
    const o = end - k * step - step;
    const c = end - k * step;
    out.push(bar(o, c + 0.5, o - 0.5, c));
  }
  return out;
}

describe("priorTrend", () => {
  it("classifies declines and rallies", () => {
    const d = decline(10, 100);
    expect(priorTrend(d, d.length - 1)).toBe("down");
    const r = rally(10, 100);
    expect(priorTrend(r, r.length - 1)).toBe("up");
    const flat = Array.from({ length: 10 }, () => bar(100, 101, 99, 100.2));
    expect(priorTrend(flat, 9)).toBe("flat");
  });
});

describe("single-bar patterns", () => {
  it("finds a Doji", () => {
    const cs = [...decline(8, 100), bar(100, 103, 97, 100.1)];
    const hits = detectPatternsAt(cs, cs.length - 1);
    expect(hits.map((h) => h.name)).toContain("Doji");
  });
  it("finds a Hammer after a decline and a Hanging Man after a rally", () => {
    const d = [...decline(8, 100), bar(100, 100.4, 94, 100.8)];
    expect(detectPatternsAt(d, d.length - 1).map((h) => h.name)).toContain("Hammer");
    const r = [...rally(8, 100), bar(100, 100.4, 94, 100.8)];
    expect(detectPatternsAt(r, r.length - 1).map((h) => h.name)).toContain("Hanging Man");
  });
  it("finds a Shooting Star after a rally", () => {
    const r = [...rally(8, 100), bar(100, 106, 99.6, 99.2)];
    expect(detectPatternsAt(r, r.length - 1).map((h) => h.name)).toContain("Shooting Star");
  });
  it("does not call a hammer without a prior decline", () => {
    const flat = Array.from({ length: 10 }, () => bar(100, 101, 99, 100.2));
    const cs = [...flat, bar(100, 100.4, 94, 100.8)];
    expect(detectPatternsAt(cs, cs.length - 1).map((h) => h.name)).not.toContain("Hammer");
  });
});

describe("two-bar patterns", () => {
  it("finds a Bullish Engulfing with strength 3 after a decline", () => {
    const cs = [...decline(8, 100), bar(100, 100.5, 97, 97.5), bar(97, 102, 96.5, 101.5)];
    const hit = detectPatternsAt(cs, cs.length - 1).find((h) => h.name === "Bullish Engulfing");
    expect(hit).toBeDefined();
    expect(hit!.strength).toBe(3);
    expect(hit!.direction).toBe("bullish");
  });
  it("finds a Bearish Engulfing after a rally", () => {
    const cs = [...rally(8, 100), bar(100, 103, 99.5, 102.5), bar(103, 103.5, 98, 98.5)];
    expect(detectPatternsAt(cs, cs.length - 1).map((h) => h.name)).toContain("Bearish Engulfing");
  });
  it("finds a Piercing Line and Dark Cloud Cover", () => {
    const p = [...decline(8, 100), bar(104, 104.5, 99.5, 100), bar(99, 103.5, 98.5, 103)];
    expect(detectPatternsAt(p, p.length - 1).map((h) => h.name)).toContain("Piercing Line");
    const d = [...rally(8, 100), bar(96, 100.5, 95.5, 100), bar(101, 101.5, 96.5, 97)];
    expect(detectPatternsAt(d, d.length - 1).map((h) => h.name)).toContain("Dark Cloud Cover");
  });
});

describe("three-bar patterns", () => {
  it("finds a Morning Star", () => {
    const cs = [...decline(8, 100), bar(104, 104.5, 98.5, 99), bar(98.5, 99.5, 97.8, 98.2), bar(98.8, 104, 98.5, 103.5)];
    const hits = detectPatternsAt(cs, cs.length - 1);
    expect(hits.map((h) => h.name)).toContain("Morning Star");
    expect(hits.find((h) => h.name === "Morning Star")!.strength).toBe(3);
  });
  it("finds an Evening Star", () => {
    const cs = [...rally(8, 100), bar(96, 101.5, 95.5, 101), bar(101.5, 102.2, 100.5, 101.8), bar(101.2, 101.5, 96, 96.5)];
    expect(detectPatternsAt(cs, cs.length - 1).map((h) => h.name)).toContain("Evening Star");
  });
  it("finds Three White Soldiers and Three Black Crows", () => {
    const base = Array.from({ length: 10 }, () => bar(100, 101.5, 98.5, 100.5));
    const s = [...base, bar(100, 103, 99.8, 102.8), bar(101, 105, 100.8, 104.8), bar(103, 107, 102.8, 106.8)];
    expect(detectPatternsAt(s, s.length - 1).map((h) => h.name)).toContain("Three White Soldiers");
    const c = [...base, bar(100, 100.2, 97, 97.2), bar(99, 99.2, 95, 95.2), bar(97, 97.2, 93, 93.2)];
    expect(detectPatternsAt(c, c.length - 1).map((h) => h.name)).toContain("Three Black Crows");
  });
});
