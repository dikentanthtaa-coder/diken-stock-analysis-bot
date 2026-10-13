import { describe, it, expect } from "vitest";
import { assessRegime } from "./regime-calc";
import type { Bar } from "./intervals";

const mk = (n: number, f: (i: number) => number, vol = (i: number) => 1000 + (i % 3) * 100): Bar[] =>
  Array.from({ length: n }, (_, i) => ({ time: 1_700_000_000 + i * 86_400, open: f(i), high: f(i) * 1.005, low: f(i) * 0.995, close: f(i), volume: vol(i) }));
const base = { niftyForming: false, nifty500: null, vix: null, fetchedAt: "2026-10-13T10:00:00Z", status: "closed", source: "yahoo" };

describe("assessRegime", () => {
  it("calls a steady rise a confirmed uptrend with full exposure", () => {
    const r = assessRegime({ ...base, nifty: mk(300, (i) => 20000 + i * 10) });
    expect(r.posture).toBe("confirmed-uptrend");
    expect(r.exposureCeilingPct).toBe(100);
  });
  it("calls a market 15% off its high and below both averages a correction", () => {
    const r = assessRegime({ ...base, nifty: mk(300, (i) => (i < 250 ? 20000 + i * 10 : 22500 - (i - 250) * 80)) });
    expect(r.posture).toBe("correction");
    expect(r.exposureCeilingPct).toBeLessThanOrEqual(20);
  });
  it("caps exposure when VIX spikes", () => {
    const r = assessRegime({ ...base, nifty: mk(300, (i) => 20000 + i * 10), vix: mk(10, () => 27) });
    expect(r.exposureCeilingPct).toBeLessThanOrEqual(25);
  });
  it("counts distribution days (down ≥ 0.2% on higher volume)", () => {
    // Last 25 sessions alternate: a down day on higher volume every 4th bar → ~6.
    const nifty = mk(300, (i) => (i >= 275 && i % 4 === 0 ? 23000 - 100 : 23000 + (i % 4)), (i) => (i >= 275 && i % 4 === 0 ? 5000 : 1000));
    const r = assessRegime({ ...base, nifty });
    expect(r.nifty.distributionDays).toBeGreaterThanOrEqual(5);
    expect(r.posture).not.toBe("confirmed-uptrend");
  });
});
