// Shared domain types used across client and server. No secrets here.

export type Exchange = "NSE" | "BSE";

export const VIDEO_STATUSES = [
  "Pending",
  "Processing",
  "Completed",
  "TranscriptUnavailable",
  "Failed",
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const ANALYSIS_OUTCOMES = [
  "PotentialBuySetup",
  "WatchlistWait",
  "NoTrade",
  "InsufficientData",
  "ReviewPosition",
] as const;
export type AnalysisOutcome = (typeof ANALYSIS_OUTCOMES)[number];

export interface OHLCV {
  date: string; // ISO date (YYYY-MM-DD)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DataFreshness {
  source: string;
  fetchedAt: string; // ISO datetime
  isRealtime: false; // this app only handles EOD/delayed data
  lastCandleDate: string | null;
}

export interface TradePlanInput {
  entryPrice: number;
  stopLoss: number;
  target1?: number;
  target2?: number;
  budget: number; // available capital for this trade
  riskBudget: number; // max monetary risk (already resolved from % if needed)
  estimatedCostPerShareFactor?: number; // e.g. 1.001 for ~0.1% buy-side costs
}

export interface TradePlanResult {
  riskPerShare: number;
  rewardPerShareT1: number | null;
  riskRewardT1: number | null;
  riskBasedQty: number;
  budgetBasedQty: number;
  finalQty: number;
  capitalRequired: number;
  plannedLossAtStop: number;
  grossProfitT1: number | null;
  grossProfitT2: number | null;
  warnings: string[];
}
