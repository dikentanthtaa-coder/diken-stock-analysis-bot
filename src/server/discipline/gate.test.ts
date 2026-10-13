import { describe, it, expect } from "vitest";
import { runGate, GATE_DEFAULTS, type GateInput } from "./gate";

const base: GateInput = {
  direction: "long", entry: 100, stop: 97, target1: 106, quantity: 300,
  capital: 100_000, maxRiskPct: 1, openExposure: 0, openPositions: 0, maxOpenPositions: 5,
  pnlToday: 0, pnlWeek: 0, dailyLossLimitPct: 2, weeklyLossLimitPct: 4, consecutiveLosses: 0,
  exposureCeilingPct: 100, marketPosture: "confirmed-uptrend",
  signal: "BUY", signalConfidence: 70, dailyTrend: "uptrend", dataStatus: "live", atr: 2, thesis: "Breakout retest holding above VWAP with volume confirmation.",
};

describe("runGate", () => {
  it("passes a clean long", () => {
    const r = runGate(base);
    expect(r.verdict).toBe("go");
    expect(r.riskPct).toBeCloseTo(0.9, 6);
    expect(r.rewardRisk).toBeCloseTo(2, 6);
  });
  it("blocks when the daily loss limit is hit", () => {
    const r = runGate({ ...base, pnlToday: -2500 });
    expect(r.verdict).toBe("blocked");
    expect(r.checks.find((c) => c.id === "breaker")!.status).toBe("fail");
  });
  it("blocks oversized risk and a stop on the wrong side", () => {
    expect(runGate({ ...base, quantity: 1000 }).verdict).toBe("blocked");
    expect(runGate({ ...base, stop: 101 }).checks.find((c) => c.id === "stop")!.status).toBe("fail");
  });
  it("blocks a long when exposure exceeds a correction ceiling", () => {
    const r = runGate({ ...base, exposureCeilingPct: 20, marketPosture: "correction", quantity: 300 });
    expect(r.exposureAfterPct).toBeCloseTo(30, 6);
    expect(r.checks.find((c) => c.id === "exposure")!.status).toBe("fail");
  });
  it("warns on HOLD, thin thesis, and tight stops", () => {
    const r = runGate({ ...base, signal: "HOLD", thesis: "yolo", stop: 99.5 });
    expect(r.verdict).toBe("caution");
    expect(r.checks.find((c) => c.id === "stop")!.status).toBe("warn");
  });
  it("fails a trade against the engine signal", () => {
    expect(runGate({ ...base, signal: "SELL" }).verdict).toBe("blocked");
  });
  it("exports sane defaults", () => {
    expect(GATE_DEFAULTS.maxRiskPct).toBe(1);
  });
});
