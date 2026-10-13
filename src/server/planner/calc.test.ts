import { describe, it, expect } from "vitest";
import { planLongTrade } from "./calc";

const base = {
  entryPrice: 100,
  stopLoss: 95,
  target1: 110,
  target2: 120,
  budget: 100_000,
  riskBudget: 2_000,
  costFactor: 1.001,
};

describe("planLongTrade", () => {
  it("computes the documented formulas", () => {
    const r = planLongTrade(base);
    if (!r.ok) throw new Error("expected ok");
    expect(r.riskPerShare).toBe(5);
    expect(r.riskBasedQty).toBe(400); // floor(2000 / 5)
    expect(r.budgetBasedQty).toBe(Math.floor(100_000 / (100 * 1.001))); // 999
    expect(r.finalQty).toBe(400); // min(400, 999)
    expect(r.plannedLossAtStop).toBe(2000);
    expect(r.riskRewardT1).toBe(2);
    expect(r.riskRewardT2).toBe(4);
    expect(r.grossProfitT1).toBe(4000);
    expect(r.grossProfitT2).toBe(8000);
    expect(r.capitalRequired).toBeCloseTo(400 * 100 * 1.001, 6);
  });

  it("uses the budget cap when it is the binding constraint", () => {
    const r = planLongTrade({ ...base, budget: 10_000 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.budgetBasedQty).toBe(99);
    expect(r.finalQty).toBe(99);
  });

  it("rejects stop at or above entry", () => {
    const r = planLongTrade({ ...base, stopLoss: 100 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/stop-loss must be below/i);
  });

  it("rejects target1 at or below entry", () => {
    const r = planLongTrade({ ...base, target1: 99 });
    expect(r.ok).toBe(false);
  });

  it("rejects non-positive and non-finite inputs", () => {
    expect(planLongTrade({ ...base, entryPrice: 0 }).ok).toBe(false);
    expect(planLongTrade({ ...base, budget: -1 }).ok).toBe(false);
    expect(planLongTrade({ ...base, riskBudget: NaN }).ok).toBe(false);
  });

  it("warns when final quantity is zero", () => {
    const r = planLongTrade({ ...base, riskBudget: 2 }); // risk/share 5 > 2
    if (!r.ok) throw new Error("expected ok");
    expect(r.finalQty).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/quantity is zero/i);
  });

  it("warns on poor risk/reward and always on gap risk", () => {
    const r = planLongTrade({ ...base, target1: 104 }); // RR 0.8
    if (!r.ok) throw new Error("expected ok");
    expect(r.warnings.join(" ")).toMatch(/below the common/i);
    expect(r.warnings.join(" ")).toMatch(/not a guaranteed exit/i);
  });

  it("works without targets", () => {
    const r = planLongTrade({ ...base, target1: null, target2: null });
    if (!r.ok) throw new Error("expected ok");
    expect(r.riskRewardT1).toBeNull();
    expect(r.grossProfitT1).toBeNull();
  });
});
