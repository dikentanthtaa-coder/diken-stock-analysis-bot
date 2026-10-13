import { describe, it, expect } from "vitest";
import { adx, stochastic, obv, trendTemplate } from "./indicators";

const up = (n: number) => Array.from({ length: n }, (_, i) => ({ high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 100 }));
const flat = (n: number) => Array.from({ length: n }, (_, i) => ({ high: 101 + (i % 2), low: 99 - (i % 2), close: 100 + (i % 2 ? 0.3 : -0.3), volume: 100 }));

describe("adx", () => {
  it("reads a strong uptrend as high ADX with +DI > −DI, and a choppy range as low ADX", () => {
    const a = adx(up(60)).at(-1)!;
    expect(a.adx!).toBeGreaterThan(40);
    expect(a.plusDi!).toBeGreaterThan(a.minusDi!);
    const b = adx(flat(60)).at(-1)!;
    expect(b.adx!).toBeLessThan(25);
  });
  it("warms up for 2×period bars", () => {
    const a = adx(up(60), 14);
    expect(a[26].adx).toBeNull();
    expect(a[27].adx).not.toBeNull();
  });
});

describe("stochastic", () => {
  it("is 100 at a new high of the window and 0 at a new low", () => {
    const s = stochastic(up(30), 14, 3);
    expect(s.at(-1)!.k).toBeCloseTo(((100.5 + 29 - (99 + 16)) / (101 + 29 - (99 + 16))) * 100, 6);
    const dn = Array.from({ length: 30 }, (_, i) => ({ high: 200 - i, low: 198 - i, close: 198 - i, volume: 1 }));
    expect(stochastic(dn, 14, 3).at(-1)!.k).toBe(0);
    expect(s[14].d).toBeNull();
    expect(s[15].d).not.toBeNull();
  });
});

describe("obv", () => {
  it("adds volume on up closes and subtracts on down closes", () => {
    const cs = [{ close: 10, volume: 5 }, { close: 11, volume: 7 }, { close: 10.5, volume: 3 }, { close: 10.5, volume: 9 }];
    expect(obv(cs)).toEqual([0, 7, 4, 4]);
  });
});

describe("trendTemplate", () => {
  it("passes all 8 checks on a long steady uptrend and fails on a downtrend", () => {
    const upD = Array.from({ length: 260 }, (_, i) => ({ high: 102 + i, low: 98 + i, close: 100 + i, volume: 1 }));
    const t = trendTemplate(upD)!;
    expect(t.passed).toBe(8);
    expect(t.verdict).toBe("stage2");
    const dnD = Array.from({ length: 260 }, (_, i) => ({ high: 402 - i, low: 398 - i, close: 400 - i, volume: 1 }));
    const d = trendTemplate(dnD)!;
    expect(d.verdict).toBe("no");
    expect(d.checks.find((c) => c.id === "above50")!.pass).toBe(false);
    expect(trendTemplate(upD.slice(0, 100))).toBeNull();
  });
});
