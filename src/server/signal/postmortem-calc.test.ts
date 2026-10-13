import { describe, it, expect } from "vitest";
import { evaluateSignal, summarizeAccuracy } from "./postmortem-calc";

const bar = (t: number, o: number, h: number, l: number, c: number) => ({ time: t, open: o, high: h, low: l, close: c, volume: 1 });
const sig = { direction: "long" as const, entry: 100, stop: 98, target1: 104, barTime: 10, maxBars: 5 };

describe("evaluateSignal", () => {
  it("ignores bars at or before the signal bar", () => {
    const r = evaluateSignal(sig, [bar(5, 100, 110, 90, 100), bar(10, 100, 110, 90, 100)]);
    expect(r.outcome).toBe("pending");
    expect(r.barsChecked).toBe(0);
  });
  it("reports target1 with +2R and the excursions", () => {
    const r = evaluateSignal(sig, [bar(11, 100, 101, 99.5, 100.5), bar(12, 100.5, 104.5, 100, 104)]);
    expect(r.outcome).toBe("target1");
    expect(r.resultR).toBe(2);
    expect(r.barsChecked).toBe(2);
    expect(r.maeR).toBeCloseTo(0.25, 6);
  });
  it("counts a stop before a target in the same bar", () => {
    const r = evaluateSignal(sig, [bar(11, 100, 105, 97, 103)]);
    expect(r.outcome).toBe("stop");
    expect(r.resultR).toBe(-1);
  });
  it("expires after maxBars with the open R", () => {
    const bars = Array.from({ length: 6 }, (_, k) => bar(11 + k, 100, 101, 99, 101));
    const r = evaluateSignal(sig, bars);
    expect(r.outcome).toBe("expired");
    expect(r.barsChecked).toBe(5);
    expect(r.resultR).toBe(0.5);
  });
  it("handles shorts and invalid stops", () => {
    const s = evaluateSignal({ ...sig, direction: "short", stop: 102, target1: 96 }, [bar(11, 100, 100.5, 95.5, 96)]);
    expect(s.outcome).toBe("target1");
    expect(evaluateSignal({ ...sig, stop: 101 }, [bar(11, 100, 101, 99, 100)]).outcome).toBe("invalid");
  });
});

describe("summarizeAccuracy", () => {
  it("aggregates hit rate and average R per interval/signal", () => {
    const rows = summarizeAccuracy([
      { interval: "5m", signal: "BUY", outcome: "target1", resultR: 2 },
      { interval: "5m", signal: "BUY", outcome: "stop", resultR: -1 },
      { interval: "5m", signal: "BUY", outcome: "pending", resultR: 0.3 },
      { interval: "1h", signal: "SELL", outcome: "expired", resultR: 0.4 },
    ]);
    const b = rows.find((r) => r.interval === "5m")!;
    expect(b.total).toBe(3);
    expect(b.hitRate).toBe(0.5);
    expect(b.avgResultR).toBe(0.5);
    const s = rows.find((r) => r.interval === "1h")!;
    expect(s.hitRate).toBeNull();
    expect(s.avgResultR).toBe(0.4);
  });
});
