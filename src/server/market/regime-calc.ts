// Pure market-regime assessment (ported in spirit from the "market
// breadth / distribution day / exposure coach" skills in
// tradermonty/claude-trading-skills, MIT): price-based trend state,
// IBD-style distribution-day count, volatility, and an exposure ceiling.

import { sma } from "@/server/analysis/indicators";
import type { Bar } from "./intervals";

export type Posture = "confirmed-uptrend" | "under-pressure" | "correction" | "rally-attempt";

export interface RegimeCheck {
  id: string;
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
}

export interface MarketRegime {
  posture: Posture;
  /** Suggested maximum share of capital in long positions (0–100). */
  exposureCeilingPct: number;
  headline: string;
  checks: RegimeCheck[];
  nifty: { close: number; sma50: number | null; sma200: number | null; offHighPct: number; ret10dPct: number; distributionDays: number };
  breadth: { nifty500AboveSma50: boolean | null; nifty500Ret20dPct: number | null };
  vix: number | null;
  asOfBarTime: number;
  fetchedAt: string;
  status: string;
  source: string;
  limitations: string[];
}

export function assessRegime(input: {
  nifty: Bar[];
  niftyForming: boolean;
  nifty500: Bar[] | null;
  vix: Bar[] | null;
  fetchedAt: string;
  status: string;
  source: string;
}): MarketRegime {
  // Use closed daily bars only.
  const bars = input.niftyForming ? input.nifty.slice(0, -1) : input.nifty;
  const closes = bars.map((b) => b.close);
  const i = bars.length - 1;
  const last = bars[i];
  const s50 = sma(closes, 50)[i];
  const s200 = sma(closes, 200)[i];
  const s200Ago = bars.length > 221 ? sma(closes, 200)[i - 21] : null;
  const hi52 = Math.max(...bars.slice(-252).map((b) => b.high));
  const offHighPct = ((hi52 - last.close) / hi52) * 100;
  const ret10dPct = i >= 10 ? ((last.close / closes[i - 10]) - 1) * 100 : 0;

  // Distribution days (IBD): down ≥ 0.2% on volume higher than the prior
  // day, counted over the last 25 sessions. Needs index volume.
  let distributionDays = 0;
  let volumeKnown = false;
  for (let k = Math.max(1, i - 24); k <= i; k++) {
    const b = bars[k], p = bars[k - 1];
    if (b.volume > 0 && p.volume > 0) volumeKnown = true;
    if (b.close < p.close * 0.998 && b.volume > p.volume && p.volume > 0) distributionDays++;
  }

  // Breadth proxy: NIFTY 500 vs its 50 DMA and 20-day return.
  let nifty500AboveSma50: boolean | null = null;
  let nifty500Ret20dPct: number | null = null;
  if (input.nifty500 && input.nifty500.length > 60) {
    const c5 = input.nifty500.map((b) => b.close);
    const j = c5.length - 1;
    const m = sma(c5, 50)[j];
    nifty500AboveSma50 = m != null ? c5[j] > m : null;
    nifty500Ret20dPct = ((c5[j] / c5[j - 20]) - 1) * 100;
  }
  const vix = input.vix?.at(-1)?.close ?? null;

  const above50 = s50 != null && last.close > s50;
  const above200 = s200 != null && last.close > s200;
  const ma200Rising = s200 != null && s200Ago != null && s200 > s200Ago;

  let posture: Posture;
  if (!above200 && !above50) posture = offHighPct < 10 && ret10dPct > 3 ? "rally-attempt" : "correction";
  else if (offHighPct > 10) posture = "correction";
  else if (!above50 || distributionDays >= 5 || offHighPct > 5) posture = "under-pressure";
  else posture = "confirmed-uptrend";

  let ceiling = posture === "confirmed-uptrend" ? 100 : posture === "under-pressure" ? 50 : posture === "rally-attempt" ? 30 : 20;
  if (posture === "confirmed-uptrend" && distributionDays >= 3) ceiling = 75;
  if (vix != null && vix >= 25) ceiling = Math.min(ceiling, 25);
  if (vix != null && vix >= 30) ceiling = Math.min(ceiling, 0);
  if (nifty500AboveSma50 === false && posture === "confirmed-uptrend") ceiling = Math.min(ceiling, 75);

  const checks: RegimeCheck[] = [
    { id: "trend", label: "NIFTY 50 vs 50/200 DMA", value: `${above50 ? "above" : "below"} 50 DMA, ${above200 ? "above" : "below"} 200 DMA${ma200Rising ? ", 200 DMA rising" : s200Ago != null ? ", 200 DMA falling" : ""}`, tone: above50 && above200 ? "good" : above200 ? "warn" : "bad" },
    { id: "offhigh", label: "Distance from 52-week high", value: `${offHighPct.toFixed(1)}% below`, tone: offHighPct < 5 ? "good" : offHighPct < 10 ? "warn" : "bad" },
    { id: "ret10", label: "10-session return", value: `${ret10dPct >= 0 ? "+" : ""}${ret10dPct.toFixed(1)}%`, tone: ret10dPct > 0 ? "good" : ret10dPct > -3 ? "neutral" : "bad" },
    { id: "dist", label: "Distribution days (25 sessions)", value: volumeKnown ? `${distributionDays}` : "n/a (no index volume)", tone: !volumeKnown ? "neutral" : distributionDays >= 5 ? "bad" : distributionDays >= 3 ? "warn" : "good" },
    { id: "breadth", label: "NIFTY 500 breadth proxy", value: nifty500AboveSma50 == null ? "n/a" : `${nifty500AboveSma50 ? "above" : "below"} 50 DMA, 20d ${nifty500Ret20dPct! >= 0 ? "+" : ""}${nifty500Ret20dPct!.toFixed(1)}%`, tone: nifty500AboveSma50 == null ? "neutral" : nifty500AboveSma50 ? "good" : "bad" },
    { id: "vix", label: "India VIX", value: vix == null ? "n/a" : vix.toFixed(1), tone: vix == null ? "neutral" : vix < 15 ? "good" : vix < 20 ? "neutral" : vix < 25 ? "warn" : "bad" },
  ];

  const headline =
    posture === "confirmed-uptrend"
      ? `Confirmed uptrend — long exposure up to ${ceiling}% of capital.`
      : posture === "under-pressure"
        ? `Uptrend under pressure — cap long exposure at ${ceiling}%, tighten stops, prefer A+ setups.`
        : posture === "rally-attempt"
          ? `Rally attempt inside a correction — probe size only (≤ ${ceiling}%) until a follow-through day.`
          : `Market in correction — new longs are low-probability; exposure ceiling ${ceiling}%.`;

  return {
    posture,
    exposureCeilingPct: ceiling,
    headline,
    checks,
    nifty: { close: last.close, sma50: s50 ?? null, sma200: s200 ?? null, offHighPct, ret10dPct, distributionDays },
    breadth: { nifty500AboveSma50, nifty500Ret20dPct },
    vix,
    asOfBarTime: last.time,
    fetchedAt: input.fetchedAt,
    status: input.status,
    source: input.source,
    limitations: [
      "Posture is derived from index price, index volume and VIX only; sector rotation, FII/DII flows and macro are not modelled.",
      "The exposure ceiling is a risk-management heuristic (IBD/Minervini style), not a forecast.",
    ],
  };
}
