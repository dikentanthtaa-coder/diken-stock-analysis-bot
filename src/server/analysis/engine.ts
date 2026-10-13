// Deterministic analysis engine: evidence-based, no confidence percentages,
// no forced recommendations. Works entirely without AI.

import {
  type Candle,
  sma,
  rsi,
  atr,
  toWeekly,
  findSwings,
  classifyTrend,
  findLevels,
  detectBreakout,
  volumeRead,
  type Level,
  type Trend,
} from "./indicators";
import type { AnalysisOutcome } from "@/lib/types";

export interface RuleMatchInput {
  id: string;
  title: string;
  ruleText: string;
  provenance: string;
  validation: string;
  timestamp: string | null;
  videoTitle: string | null;
  videoUrl: string | null;
}

export interface RuleMatch extends RuleMatchInput {
  matchedSignals: string[];
}

export interface Scenario {
  direction: "bullish" | "bearish" | "sideways";
  thesis: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  confirmation: string;
  invalidation: string;
}

export interface AnalysisReport {
  outcome: AnalysisOutcome;
  outcomeReason: string;
  asOfDate: string;
  trend: { daily: Trend; weekly: Trend; dailyEvidence: string; weeklyEvidence: string };
  structure: { swingHighs: number; swingLows: number };
  levels: Level[];
  breakout: { state: string; level: number | null; detail: string };
  volume: { ratio: number | null; detail: string };
  momentum: { rsi14: number | null; detail: string };
  volatility: { atr14: number | null; atrPct: number | null };
  movingAverages: { sma20: number | null; sma50: number | null; sma200: number | null; detail: string };
  scenarios: Scenario[];
  ruleMatches: RuleMatch[];
  dataWarnings: string[];
  limitations: string[];
}

const MIN_CANDLES = 60;

/** Keywords that connect detected signals to knowledge-base rules. */
function signalKeywords(report: {
  breakoutState: string;
  dailyTrend: Trend;
  nearSupport: boolean;
  nearResistance: boolean;
  highVolume: boolean;
}): { signal: string; keywords: string[] }[] {
  const out: { signal: string; keywords: string[] }[] = [];
  if (report.breakoutState === "breakout")
    out.push({ signal: "breakout", keywords: ["breakout", "ब्रेकआउट", "ब्रेक आउट"] });
  if (report.breakoutState === "retest")
    out.push({ signal: "retest", keywords: ["retest", "रीटेस्ट", "रिटेस्ट", "री टेस्ट"] });
  if (report.breakoutState === "breakdown")
    out.push({ signal: "breakdown", keywords: ["breakdown", "ब्रेकडाउन", "सपोर्ट"] });
  if (report.nearSupport)
    out.push({ signal: "near support/demand", keywords: ["support", "सपोर्ट", "डिमांड जोन", "demand zone"] });
  if (report.nearResistance)
    out.push({ signal: "near resistance/supply", keywords: ["resistance", "रेजिस्टेंस", "सप्लाई जोन", "supply zone"] });
  if (report.highVolume)
    out.push({ signal: "volume spike", keywords: ["volume", "वॉल्यूम"] });
  if (report.dailyTrend === "uptrend")
    out.push({ signal: "uptrend", keywords: ["uptrend", "अपट्रेंड", "higher high", "हायर हाई"] });
  return out;
}

export function analyze(
  candles: Candle[],
  dataWarnings: string[],
  rules: RuleMatchInput[],
): AnalysisReport {
  const asOfDate = candles.at(-1)?.date ?? "n/a";
  const limitations = [
    "End-of-day data only; intraday action is invisible to this analysis.",
    "Prices unadjusted for corporate actions unless the provider says otherwise.",
    "This is research output, not an order or a recommendation to trade.",
  ];

  if (candles.length < MIN_CANDLES) {
    return {
      outcome: "InsufficientData",
      outcomeReason: `Only ${candles.length} daily candles available; need at least ${MIN_CANDLES}.`,
      asOfDate,
      trend: { daily: "sideways", weekly: "sideways", dailyEvidence: "n/a", weeklyEvidence: "n/a" },
      structure: { swingHighs: 0, swingLows: 0 },
      levels: [],
      breakout: { state: "none", level: null, detail: "n/a" },
      volume: { ratio: null, detail: "n/a" },
      momentum: { rsi14: null, detail: "n/a" },
      volatility: { atr14: null, atrPct: null },
      movingAverages: { sma20: null, sma50: null, sma200: null, detail: "n/a" },
      scenarios: [],
      ruleMatches: [],
      dataWarnings,
      limitations,
    };
  }

  const closes = candles.map((c) => c.close);
  const last = candles.at(-1)!;

  // Trend: daily + weekly structure.
  const dailySwings = findSwings(candles, 2);
  const weekly = toWeekly(candles);
  const weeklySwings = findSwings(weekly, 2);
  const dailyTrend = classifyTrend(dailySwings);
  const weeklyTrend = classifyTrend(weeklySwings);

  // Levels from daily swings.
  const levels = findLevels(dailySwings, last.close);
  const breakout = detectBreakout(candles, levels);
  const volume = volumeRead(candles);

  // Indicators.
  const rsiArr = rsi(closes, 14);
  const rsi14 = rsiArr.at(-1) ?? null;
  const atrArr = atr(candles, 14);
  const atr14 = atrArr.at(-1) ?? null;
  const sma20 = sma(closes, 20).at(-1) ?? null;
  const sma50 = sma(closes, 50).at(-1) ?? null;
  const sma200 = candles.length >= 200 ? sma(closes, 200).at(-1) : null;

  const maParts: string[] = [];
  if (sma20 != null) maParts.push(`price ${last.close > sma20 ? "above" : "below"} SMA20 (${sma20.toFixed(2)})`);
  if (sma50 != null) maParts.push(`${last.close > sma50 ? "above" : "below"} SMA50 (${sma50.toFixed(2)})`);
  if (sma200 != null) maParts.push(`${last.close > sma200 ? "above" : "below"} SMA200 (${sma200.toFixed(2)})`);

  const support = levels.filter((l) => l.kind === "support").at(-1) ?? null;
  const resistance = levels.find((l) => l.kind === "resistance") ?? null;
  const nearSupport =
    support != null && (last.close - support.price) / last.close < 0.03;
  const nearResistance =
    resistance != null && (resistance.price - last.close) / last.close < 0.03;
  const highVolume = volume.ratio != null && volume.ratio >= 1.5;

  // Rule matching: connect detected signals to KB rules by literal keywords.
  const signals = signalKeywords({
    breakoutState: breakout.state,
    dailyTrend: dailyTrend.trend,
    nearSupport,
    nearResistance,
    highVolume,
  });
  const ruleMatches: RuleMatch[] = [];
  for (const rule of rules) {
    const text = (rule.title + " " + rule.ruleText).toLowerCase();
    const matched = signals
      .filter((s) => s.keywords.some((k) => text.includes(k)))
      .map((s) => s.signal);
    if (matched.length > 0) {
      ruleMatches.push({ ...rule, matchedSignals: matched });
    }
  }

  // Scenarios with explicit evidence both ways.
  const scenarios: Scenario[] = [];
  const bullFor: string[] = [];
  const bullAgainst: string[] = [];
  if (dailyTrend.trend === "uptrend") bullFor.push(`Daily ${dailyTrend.evidence}`);
  else bullAgainst.push(`Daily trend is ${dailyTrend.trend}.`);
  if (weeklyTrend.trend === "uptrend") bullFor.push(`Weekly ${weeklyTrend.evidence}`);
  else bullAgainst.push(`Weekly trend is ${weeklyTrend.trend}.`);
  if (breakout.state === "breakout" || breakout.state === "retest") bullFor.push(breakout.detail);
  if (breakout.state === "breakdown") bullAgainst.push(breakout.detail);
  if (highVolume && last.close > last.open) bullFor.push(volume.detail);
  if (sma50 != null && last.close > sma50) bullFor.push("Price above SMA50.");
  if (sma50 != null && last.close < sma50) bullAgainst.push("Price below SMA50.");
  if (rsi14 != null && rsi14 > 70) bullAgainst.push(`RSI14 ${rsi14.toFixed(1)} is overbought; chasing here worsens risk/reward.`);
  if (nearSupport && support) bullFor.push(`Price within 3% of support ${support.price.toFixed(2)} (${support.touches} touches).`);
  if (nearResistance && resistance) bullAgainst.push(`Resistance ${resistance.price.toFixed(2)} overhead within 3%.`);

  if (bullFor.length > 0) {
    scenarios.push({
      direction: "bullish",
      thesis: breakout.state === "breakout"
        ? "Breakout continuation"
        : nearSupport
          ? "Bounce from tested support"
          : "Trend continuation",
      evidenceFor: bullFor,
      evidenceAgainst: bullAgainst,
      confirmation: breakout.state === "retest"
        ? `Hold above ${breakout.level?.toFixed(2)} on the retest with above-average volume.`
        : resistance
          ? `Daily close above ${resistance.price.toFixed(2)} with volume ≥ 1.5× average.`
          : "Daily close above the last swing high with above-average volume.",
      invalidation: support
        ? `Daily close below support ${support.price.toFixed(2)}.`
        : "Daily close below the last swing low.",
    });
  }

  const bearFor: string[] = [];
  const bearAgainst: string[] = [];
  if (dailyTrend.trend === "downtrend") bearFor.push(`Daily ${dailyTrend.evidence}`);
  if (weeklyTrend.trend === "downtrend") bearFor.push(`Weekly ${weeklyTrend.evidence}`);
  if (breakout.state === "breakdown") bearFor.push(breakout.detail);
  if (sma50 != null && last.close < sma50) bearFor.push("Price below SMA50.");
  if (dailyTrend.trend === "uptrend") bearAgainst.push("Daily structure still makes higher highs/lows.");
  if (nearSupport && support) bearAgainst.push(`Tested support ${support.price.toFixed(2)} sits just below.`);
  if (bearFor.length > 0) {
    scenarios.push({
      direction: "bearish",
      thesis: breakout.state === "breakdown" ? "Breakdown continuation" : "Trend weakness",
      evidenceFor: bearFor,
      evidenceAgainst: bearAgainst,
      confirmation: support
        ? `Daily close below ${support.price.toFixed(2)}.`
        : "Daily close below the last swing low.",
      invalidation: resistance
        ? `Daily close back above ${resistance.price.toFixed(2)}.`
        : "Daily close above the last swing high.",
    });
  }

  if (dailyTrend.trend === "sideways" || scenarios.length === 0) {
    scenarios.push({
      direction: "sideways",
      thesis: "Range-bound until a level breaks",
      evidenceFor: [dailyTrend.evidence],
      evidenceAgainst: [],
      confirmation: "A daily close beyond the nearest level with volume defines direction.",
      invalidation: "n/a — this is the neutral state.",
    });
  }

  // Outcome classification (conservative; never forces a trade).
  let outcome: AnalysisOutcome = "NoTrade";
  let outcomeReason = "No setup with clear edge detected.";
  const uptrendAligned = dailyTrend.trend === "uptrend" && weeklyTrend.trend !== "downtrend";
  if (uptrendAligned && breakout.state === "retest") {
    outcome = "PotentialBuySetup";
    outcomeReason = "Uptrend with breakout retest in progress — entry conditions definable.";
  } else if (uptrendAligned && breakout.state === "breakout" && highVolume) {
    outcome = "WatchlistWait";
    outcomeReason = "Fresh volume-backed breakout in an uptrend — wait for a retest or a tighter entry rather than chasing.";
  } else if (uptrendAligned && nearSupport) {
    outcome = "WatchlistWait";
    outcomeReason = "Uptrend near tested support — watch for a reversal trigger before entry.";
  } else if (breakout.state === "breakdown" || dailyTrend.trend === "downtrend") {
    outcome = "NoTrade";
    outcomeReason = "Bearish structure for a long-only swing approach — no trade.";
  }

  return {
    outcome,
    outcomeReason,
    asOfDate,
    trend: {
      daily: dailyTrend.trend,
      weekly: weeklyTrend.trend,
      dailyEvidence: dailyTrend.evidence,
      weeklyEvidence: weeklyTrend.evidence,
    },
    structure: {
      swingHighs: dailySwings.filter((s) => s.kind === "high").length,
      swingLows: dailySwings.filter((s) => s.kind === "low").length,
    },
    levels,
    breakout,
    volume,
    momentum: {
      rsi14,
      detail:
        rsi14 == null
          ? "n/a"
          : rsi14 > 70
            ? `RSI14 ${rsi14.toFixed(1)} — overbought zone.`
            : rsi14 < 30
              ? `RSI14 ${rsi14.toFixed(1)} — oversold zone.`
              : `RSI14 ${rsi14.toFixed(1)} — neutral.`,
    },
    volatility: {
      atr14,
      atrPct: atr14 != null ? (atr14 / last.close) * 100 : null,
    },
    movingAverages: { sma20, sma50, sma200: sma200 ?? null, detail: maParts.join("; ") || "n/a" },
    scenarios,
    ruleMatches,
    dataWarnings,
    limitations,
  };
}
