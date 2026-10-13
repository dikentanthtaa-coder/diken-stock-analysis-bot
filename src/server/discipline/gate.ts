// Pre-trade discipline gate + drawdown circuit breaker. Pure function.
// Ported in spirit from the "pre-trade-discipline-gate" and
// "drawdown-circuit-breaker" skills (tradermonty/claude-trading-skills,
// MIT): a checklist that must pass before a trade is recorded, with hard
// blocks for the rules a tired trader is most tempted to break.

export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface GateCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export type GateVerdict = "go" | "caution" | "blocked";

export interface GateInput {
  direction: "long" | "short";
  entry: number;
  stop: number;
  target1: number | null;
  quantity: number;
  capital: number; // account size
  maxRiskPct: number; // e.g. 1 → 1% of capital per trade
  /** Capital already deployed in open positions (₹). */
  openExposure: number;
  openPositions: number;
  maxOpenPositions: number;
  /** Realised P&L over the last trading day and week (₹, negative = loss). */
  pnlToday: number;
  pnlWeek: number;
  dailyLossLimitPct: number; // e.g. 2
  weeklyLossLimitPct: number; // e.g. 4
  consecutiveLosses: number;
  /** Market regime exposure ceiling (0–100) or null when unknown. */
  exposureCeilingPct: number | null;
  marketPosture: string | null;
  /** Live signal for the symbol/timeframe, when known. */
  signal: "BUY" | "SELL" | "HOLD" | null;
  signalConfidence: number | null;
  dailyTrend: "uptrend" | "downtrend" | "sideways" | null;
  dataStatus: string | null;
  atr: number | null;
  thesis: string | null;
}

export interface GateResult {
  verdict: GateVerdict;
  checks: GateCheck[];
  riskPerShare: number;
  riskAmount: number;
  riskPct: number;
  rewardRisk: number | null;
  positionValue: number;
  exposureAfterPct: number;
  summary: string;
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export function runGate(input: GateInput): GateResult {
  const checks: GateCheck[] = [];
  const long = input.direction === "long";
  const riskPerShare = long ? input.entry - input.stop : input.stop - input.entry;
  const riskAmount = riskPerShare * input.quantity;
  const riskPct = input.capital > 0 ? (riskAmount / input.capital) * 100 : 0;
  const positionValue = input.entry * input.quantity;
  const exposureAfterPct = input.capital > 0 ? ((input.openExposure + positionValue) / input.capital) * 100 : 0;
  const rewardRisk =
    input.target1 != null && riskPerShare > 0
      ? (long ? input.target1 - input.entry : input.entry - input.target1) / riskPerShare
      : null;

  // 1. Stop placement
  if (!(riskPerShare > 0)) {
    checks.push({ id: "stop", label: "Stop-loss defined on the correct side", status: "fail", detail: `Stop ${input.stop} must be ${long ? "below" : "above"} entry ${input.entry}.` });
  } else if (input.atr != null && riskPerShare < 0.5 * input.atr) {
    checks.push({ id: "stop", label: "Stop-loss outside noise", status: "warn", detail: `Stop is ${(riskPerShare / input.atr).toFixed(2)} ATR from entry — inside normal bar noise; expect to be stopped by randomness.` });
  } else if (input.atr != null && riskPerShare > 3 * input.atr) {
    checks.push({ id: "stop", label: "Stop-loss not too wide", status: "warn", detail: `Stop is ${(riskPerShare / input.atr).toFixed(1)} ATR away; position size must shrink to keep risk fixed.` });
  } else {
    checks.push({ id: "stop", label: "Stop-loss defined", status: "pass", detail: `Risk ${riskPerShare.toFixed(2)}/share${input.atr != null ? ` (${(riskPerShare / input.atr).toFixed(2)} ATR)` : ""}.` });
  }

  // 2. Risk per trade
  if (riskPerShare > 0) {
    if (riskPct > input.maxRiskPct * 1.5) checks.push({ id: "risk", label: `Risk ≤ ${input.maxRiskPct}% of capital`, status: "fail", detail: `This trade risks ${inr(riskAmount)} = ${riskPct.toFixed(2)}% of ${inr(input.capital)}. Reduce quantity to ≤ ${Math.floor((input.capital * input.maxRiskPct) / 100 / riskPerShare)}.` });
    else if (riskPct > input.maxRiskPct) checks.push({ id: "risk", label: `Risk ≤ ${input.maxRiskPct}% of capital`, status: "warn", detail: `${riskPct.toFixed(2)}% at risk, slightly above the ${input.maxRiskPct}% rule.` });
    else checks.push({ id: "risk", label: `Risk ≤ ${input.maxRiskPct}% of capital`, status: "pass", detail: `${inr(riskAmount)} = ${riskPct.toFixed(2)}% at risk.` });
  }

  // 3. Reward:risk
  if (rewardRisk == null) checks.push({ id: "rr", label: "Reward:risk ≥ 1.5", status: "warn", detail: "No target set — define where you take profit before entering." });
  else if (rewardRisk < 1) checks.push({ id: "rr", label: "Reward:risk ≥ 1.5", status: "fail", detail: `R:R ${rewardRisk.toFixed(2)} — risking more than the expected gain.` });
  else if (rewardRisk < 1.5) checks.push({ id: "rr", label: "Reward:risk ≥ 1.5", status: "warn", detail: `R:R ${rewardRisk.toFixed(2)} needs a > 40% win rate just to break even after costs.` });
  else checks.push({ id: "rr", label: "Reward:risk ≥ 1.5", status: "pass", detail: `R:R ${rewardRisk.toFixed(2)}.` });

  // 4. Circuit breaker
  const dayLimit = (input.capital * input.dailyLossLimitPct) / 100;
  const weekLimit = (input.capital * input.weeklyLossLimitPct) / 100;
  if (input.pnlToday <= -dayLimit) checks.push({ id: "breaker", label: "Drawdown circuit breaker", status: "fail", detail: `Today's realised loss ${inr(-input.pnlToday)} ≥ the ${input.dailyLossLimitPct}% daily limit (${inr(dayLimit)}). Stop trading for the day.` });
  else if (input.pnlWeek <= -weekLimit) checks.push({ id: "breaker", label: "Drawdown circuit breaker", status: "fail", detail: `This week's realised loss ${inr(-input.pnlWeek)} ≥ the ${input.weeklyLossLimitPct}% weekly limit (${inr(weekLimit)}). Step back until next week.` });
  else if (input.consecutiveLosses >= 3) checks.push({ id: "breaker", label: "Drawdown circuit breaker", status: "warn", detail: `${input.consecutiveLosses} losses in a row — halve size or pause; revenge trading starts here.` });
  else checks.push({ id: "breaker", label: "Drawdown circuit breaker", status: "pass", detail: `Today ${inr(input.pnlToday)}, week ${inr(input.pnlWeek)}; limits ${input.dailyLossLimitPct}% / ${input.weeklyLossLimitPct}%.` });

  // 5. Exposure vs market regime
  if (input.exposureCeilingPct == null) checks.push({ id: "exposure", label: "Exposure within market ceiling", status: "skip", detail: "Market regime unavailable." });
  else if (long && exposureAfterPct > input.exposureCeilingPct) checks.push({ id: "exposure", label: "Exposure within market ceiling", status: input.exposureCeilingPct <= 25 ? "fail" : "warn", detail: `After this trade long exposure would be ${exposureAfterPct.toFixed(0)}% vs the ${input.exposureCeilingPct}% ceiling for a "${input.marketPosture}" market.` });
  else checks.push({ id: "exposure", label: "Exposure within market ceiling", status: "pass", detail: `${exposureAfterPct.toFixed(0)}% after this trade; ceiling ${input.exposureCeilingPct}% (${input.marketPosture}).` });

  // 6. Position count
  if (input.openPositions >= input.maxOpenPositions) checks.push({ id: "count", label: `≤ ${input.maxOpenPositions} open positions`, status: "warn", detail: `${input.openPositions} already open — attention is the scarce resource.` });
  else checks.push({ id: "count", label: `≤ ${input.maxOpenPositions} open positions`, status: "pass", detail: `${input.openPositions} open.` });

  // 7. Alignment with the engine and the daily trend
  if (input.signal == null) checks.push({ id: "signal", label: "Engine agrees with the trade", status: "skip", detail: "No live signal supplied." });
  else if ((long && input.signal === "SELL") || (!long && input.signal === "BUY")) checks.push({ id: "signal", label: "Engine agrees with the trade", status: "fail", detail: `Live signal is ${input.signal}; this trade is against it. Write down why you know better.` });
  else if (input.signal === "HOLD") checks.push({ id: "signal", label: "Engine agrees with the trade", status: "warn", detail: `Live signal is HOLD${input.signalConfidence != null ? ` (confidence ${input.signalConfidence})` : ""}; evidence is mixed.` });
  else checks.push({ id: "signal", label: "Engine agrees with the trade", status: "pass", detail: `Live signal ${input.signal}${input.signalConfidence != null ? ` (confidence ${input.signalConfidence})` : ""}.` });
  if (input.dailyTrend != null) {
    const against = (long && input.dailyTrend === "downtrend") || (!long && input.dailyTrend === "uptrend");
    checks.push({ id: "daily", label: "Not against the daily trend", status: against ? "warn" : "pass", detail: `Daily structure: ${input.dailyTrend}.` });
  }

  // 8. Data freshness
  if (input.dataStatus === "stale") checks.push({ id: "data", label: "Fresh market data", status: "fail", detail: "Prices are stale — you cannot know where the market is." });
  else if (input.dataStatus === "delayed") checks.push({ id: "data", label: "Fresh market data", status: "warn", detail: "Data is delayed; confirm the live price with your broker before entering." });
  else if (input.dataStatus) checks.push({ id: "data", label: "Fresh market data", status: "pass", detail: `Data status: ${input.dataStatus}.` });

  // 9. Thesis
  if (!input.thesis || input.thesis.trim().length < 20) checks.push({ id: "thesis", label: "Thesis written (≥ 20 chars)", status: "warn", detail: "A trade without a written thesis cannot be reviewed honestly afterwards." });
  else checks.push({ id: "thesis", label: "Thesis written", status: "pass", detail: `${input.thesis.trim().length} characters.` });

  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const verdict: GateVerdict = fails > 0 ? "blocked" : warns > 0 ? "caution" : "go";
  const summary =
    verdict === "blocked"
      ? `Blocked: ${checks.filter((c) => c.status === "fail").map((c) => c.label).join("; ")}.`
      : verdict === "caution"
        ? `Proceed with caution: ${warns} warning${warns > 1 ? "s" : ""} to acknowledge.`
        : "All checks passed.";
  return { verdict, checks, riskPerShare, riskAmount, riskPct, rewardRisk, positionValue, exposureAfterPct, summary };
}

export const GATE_DEFAULTS = {
  capital: 100_000,
  maxRiskPct: 1,
  maxOpenPositions: 5,
  dailyLossLimitPct: 2,
  weeklyLossLimitPct: 4,
};
