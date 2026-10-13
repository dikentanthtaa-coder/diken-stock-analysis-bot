import "server-only";

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
