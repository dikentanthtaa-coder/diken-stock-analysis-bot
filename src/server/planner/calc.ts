// Deterministic position-sizing and risk calculations for long swing trades.
// Pure functions, fully unit-tested. All currency values in INR.

export interface PlanInput {
  entryPrice: number;
  stopLoss: number;
  target1?: number | null;
  target2?: number | null;
  budget: number; // capital available for this trade
  riskBudget: number; // max acceptable monetary loss
  // All-in cost factor on the buy side (brokerage+STT+charges), e.g. 1.0012
  costFactor?: number;
}

export interface PlanResult {
  ok: true;
  riskPerShare: number;
  rewardPerShareT1: number | null;
  rewardPerShareT2: number | null;
  riskRewardT1: number | null;
  riskRewardT2: number | null;
  riskBasedQty: number;
  budgetBasedQty: number;
  finalQty: number;
  capitalRequired: number;
  plannedLossAtStop: number;
  grossProfitT1: number | null;
  grossProfitT2: number | null;
  estimatedBuyCosts: number;
  warnings: string[];
}

export interface PlanError {
  ok: false;
  errors: string[];
}

const DEFAULT_COST_FACTOR = 1.0012; // ~0.12% all-in buy-side estimate

export function planLongTrade(input: PlanInput): PlanResult | PlanError {
  const errors: string[] = [];
  const {
    entryPrice,
    stopLoss,
    target1 = null,
    target2 = null,
    budget,
    riskBudget,
  } = input;
  const costFactor = input.costFactor ?? DEFAULT_COST_FACTOR;

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) errors.push("Entry price must be positive.");
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) errors.push("Stop-loss must be positive.");
  if (!Number.isFinite(budget) || budget <= 0) errors.push("Budget must be positive.");
  if (!Number.isFinite(riskBudget) || riskBudget <= 0) errors.push("Risk budget must be positive.");
  if (costFactor < 1 || costFactor > 1.1) errors.push("Cost factor out of sane range (1.0–1.1).");
  if (errors.length === 0 && stopLoss >= entryPrice) {
    errors.push("For a long trade the stop-loss must be below the entry price.");
  }
  if (errors.length === 0 && target1 != null && target1 <= entryPrice) {
    errors.push("Target 1 must be above the entry price for a long trade.");
  }
  if (errors.length === 0 && target2 != null && target1 != null && target2 <= target1) {
    errors.push("Target 2 must be above Target 1.");
  }
  if (errors.length > 0) return { ok: false, errors };

  const riskPerShare = entryPrice - stopLoss;
  const allInPerShare = entryPrice * costFactor;

  const riskBasedQty = Math.floor(riskBudget / riskPerShare);
  const budgetBasedQty = Math.floor(budget / allInPerShare);
  const finalQty = Math.max(0, Math.min(riskBasedQty, budgetBasedQty));

  const warnings: string[] = [];
  if (finalQty === 0) {
    warnings.push(
      "Calculated quantity is zero — risk per share or price is too large for the given budget/risk.",
    );
  }
  if (riskPerShare / entryPrice < 0.005) {
    warnings.push(
      "Stop is less than 0.5% from entry — daily noise will likely hit it.",
    );
  }
  if (riskPerShare / entryPrice > 0.15) {
    warnings.push("Stop is more than 15% from entry — unusually wide for a swing trade.");
  }

  const rewardPerShareT1 = target1 != null ? target1 - entryPrice : null;
  const rewardPerShareT2 = target2 != null ? target2 - entryPrice : null;
  const riskRewardT1 = rewardPerShareT1 != null ? rewardPerShareT1 / riskPerShare : null;
  const riskRewardT2 = rewardPerShareT2 != null ? rewardPerShareT2 / riskPerShare : null;
  if (riskRewardT1 != null && riskRewardT1 < 1.5) {
    warnings.push(
      `Risk/reward to Target 1 is ${riskRewardT1.toFixed(2)} — below the common 1:1.5 minimum for swing trades.`,
    );
  }
  warnings.push(
    "A stop-loss is not a guaranteed exit price: gaps and slippage can produce larger losses.",
  );

  const capitalRequired = finalQty * allInPerShare;
  return {
    ok: true,
    riskPerShare,
    rewardPerShareT1,
    rewardPerShareT2,
    riskRewardT1,
    riskRewardT2,
    riskBasedQty,
    budgetBasedQty,
    finalQty,
    capitalRequired,
    plannedLossAtStop: finalQty * riskPerShare,
    grossProfitT1: rewardPerShareT1 != null ? finalQty * rewardPerShareT1 : null,
    grossProfitT2: rewardPerShareT2 != null ? finalQty * rewardPerShareT2 : null,
    estimatedBuyCosts: finalQty * entryPrice * (costFactor - 1),
    warnings,
  };
}
