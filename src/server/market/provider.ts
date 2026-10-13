import "server-only";
import type { Bar, Interval, MarketState } from "./intervals";

// Provider-independent market data contracts. The analysis engine only
// sees these types, so providers can be swapped without touching it.

export interface DailyCandle {
  date: string; // YYYY-MM-DD (exchange trading day)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolResult {
  symbol: string;
  exchange: "NSE" | "BSE";
  name: string;
  sector?: string;
}

export interface CandleResponse {
  candles: DailyCandle[];
  source: string;
  adjusted: boolean;
  fetchedAt: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "not_found"
      | "rate_limited"
      | "unavailable"
      | "needs_key"
      | "bad_response",
  ) {
    super(message);
  }
}

export interface MarketDataProvider {
  readonly id: string;
  getDailyCandles(
    symbol: string,
    exchange: "NSE" | "BSE",
    fromDate: string,
    toDate: string,
  ): Promise<CandleResponse>;
}

export interface SymbolSearchProvider {
  readonly id: string;
  searchSymbols(query: string): Promise<SymbolResult[]>;
}

// ---------- Intraday / multi-timeframe ----------

export type { Bar, Interval, MarketState };

export interface QuoteMeta {
  /** Last trade price reported by the provider (may be newer than the last bar). */
  lastPrice: number | null;
  /** Unix seconds of the last trade the provider knows about. */
  lastTradeTime: number | null;
  previousClose: number | null;
  /** Provider-declared delay in minutes; null when the provider does not say. */
  declaredDelayMin: number | null;
  currency: string | null;
  longName: string | null;
}

export interface IntradayResponse {
  interval: Interval;
  /** Closed and forming bars, oldest first, on the interval grid. */
  bars: Bar[];
  /** Whether the last bar's window has not yet ended (still forming). */
  lastBarForming: boolean;
  source: string;
  fetchedAt: string;
  quote: QuoteMeta;
}

export interface IntradayProvider {
  readonly id: string;
  getIntradayBars(
    symbol: string,
    exchange: "NSE" | "BSE",
    interval: Interval,
  ): Promise<IntradayResponse>;
}
