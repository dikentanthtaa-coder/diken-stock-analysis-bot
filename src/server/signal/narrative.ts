// Prompt builder for the optional AI narrative. Follows the Claude Academy
// "prompting strategies for financial analysis" guidance: name the ticker,
// exact metric names and values, the data source and freshness, explicit
// quantitative criteria, a fixed output format, and no vague language.

import type { SignalReport } from "./engine";

export function buildNarrativePrompt(input: {
  symbol: string;
  exchange: string;
  name: string;
  interval: string;
  lastPrice: number | null;
  freshnessNote: string;
  source: string;
  report: SignalReport;
}): string {
  const r = input.report;
  const primary = r.timeframes.find((t) => t.interval === input.interval);
  const tfLines = r.timeframes.map((t) =>
    t.insufficient
      ? `- ${t.interval}: insufficient data`
      : `- ${t.interval}: score ${t.score}, structure ${t.trend}, RSI14 ${fmt(t.indicators.rsi14, 1)}, MACD hist ${fmt(t.indicators.macdHist, 3)}, %B ${fmt(t.indicators.percentB)}, ADX14 ${fmt(t.indicators.adx14, 1)}, volume ${t.indicators.volumeRatio != null ? `${t.indicators.volumeRatio.toFixed(2)}× avg` : "n/a"}`,
  );
  const factorLines = primary && !primary.insufficient
    ? primary.factors.map((f) => `- ${f.label} (${f.score > 0 ? "+" : ""}${Math.round(f.score)}): ${f.detail}`)
    : ["- n/a"];
  const patternLines = primary?.patterns.length
    ? primary.patterns.map((p) => `- ${p.name} (${p.direction}, strength ${p.strength}/3): ${p.description}`)
    : ["- none in the last 3 closed bars"];
  const plan = r.plan
    ? `Entry ${r.plan.entry}, stop ${r.plan.stop}, target1 ${r.plan.target1} (R:R ${r.plan.rewardRiskT1}), target2 ${r.plan.target2} (R:R ${r.plan.rewardRiskT2}), ATR14 ${r.plan.atr}.`
    : `No plan (HOLD). Nearest support ${r.levelsToWatch.support ?? "n/a"}, nearest resistance ${r.levelsToWatch.resistance ?? "n/a"}.`;
  return [
    `Explain the following mechanically generated signal for ${input.name} (${input.symbol}, ${input.exchange}) on the ${input.interval} chart.`,
    `Data: source ${input.source}; ${input.freshnessNote} Last price ${input.lastPrice ?? "n/a"} INR.`,
    ``,
    `ENGINE OUTPUT`,
    `Signal: ${r.signal}. Confidence ${r.confidence}/100 (${r.confidenceLabel}) — this is indicator/timeframe agreement, not a win probability. Combined score ${r.combinedScore}, agreement ${(r.agreement * 100).toFixed(0)}%.`,
    `Decision rules used: BUY needs combined ≥ 25, agreement ≥ 60%, daily score > −20 and no market-regime veto; SELL is the mirror; otherwise HOLD.`,
    r.market ? `Market regime (NIFTY): ${r.market.posture}, exposure ceiling ${r.market.exposureCeilingPct}%. ${r.market.headline}` : `Market regime: unavailable.`,
    r.trendTemplate ? `Daily trend template: ${r.trendTemplate.passed}/${r.trendTemplate.total} Minervini checks pass (${r.trendTemplate.verdict}).` : `Daily trend template: n/a (needs 200 daily bars).`,
    ``,
    `TIMEFRAMES`,
    ...tfLines,
    ``,
    `${input.interval.toUpperCase()} FACTORS`,
    ...factorLines,
    ``,
    `CANDLESTICK PATTERNS`,
    ...patternLines,
    ``,
    `TRADE PLAN`,
    plan,
    ``,
    `CAUTIONS FROM THE ENGINE`,
    ...(r.cautions.length ? r.cautions.map((c) => `- ${c}`) : ["- none"]),
    ``,
    `OUTPUT FORMAT (plain text, these five labelled paragraphs, ≤ 220 words total):`,
    `Verdict: one sentence restating the signal and confidence in plain language.`,
    `Evidence for: the 2–3 strongest supporting readings, each with its number.`,
    `Evidence against: the 2–3 strongest opposing readings or risks, each with its number.`,
    `What would change the view: the specific price levels or indicator readings that would flip the signal.`,
    `Caveats: data freshness, that this is not advice, and that no outcome is guaranteed.`,
    `Use only the numbers above. Do not add indicators or prices that are not listed.`,
  ].join("\n");
}

const fmt = (v: number | null | undefined, d = 2) => (v == null ? "n/a" : v.toFixed(d));
