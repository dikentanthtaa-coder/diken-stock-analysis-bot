import "server-only";
import {
  type MarketDataProvider,
  type SymbolSearchProvider,
  type CandleResponse,
  type DailyCandle,
  type SymbolResult,
  ProviderError,
} from "./provider";

// Yahoo Finance public endpoints (keyless). Used for symbol search and as
// a fallback candle source. NSE symbols end .NS, BSE symbols .BO.

const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };

export class YahooProvider implements MarketDataProvider, SymbolSearchProvider {
  readonly id = "yahoo";

  async searchSymbols(query: string): Promise<SymbolResult[]> {
    let res: Response;
    try {
      res = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0`,
        { headers: UA, signal: AbortSignal.timeout(20_000) },
      );
    } catch {
      throw new ProviderError("Yahoo search unreachable.", "unavailable");
    }
    if (res.status === 429) {
      throw new ProviderError("Yahoo search rate-limited.", "rate_limited");
    }
    if (!res.ok) {
      throw new ProviderError(`Yahoo search error ${res.status}`, "bad_response");
    }
    const body = (await res.json()) as {
      quotes?: {
        symbol?: string;
        longname?: string;
        shortname?: string;
        quoteType?: string;
        sectorDisp?: string;
      }[];
    };
    const out: SymbolResult[] = [];
    for (const q of body.quotes ?? []) {
      if (q.quoteType !== "EQUITY" || !q.symbol) continue;
      let exchange: "NSE" | "BSE" | null = null;
      if (q.symbol.endsWith(".NS")) exchange = "NSE";
      if (q.symbol.endsWith(".BO")) exchange = "BSE";
      if (!exchange) continue;
      out.push({
        symbol: q.symbol.replace(/\.(NS|BO)$/, ""),
        exchange,
        name: q.longname ?? q.shortname ?? q.symbol,
        sector: q.sectorDisp,
      });
    }
    return out;
  }

  async getDailyCandles(
    symbol: string,
    exchange: "NSE" | "BSE",
    fromDate: string,
    toDate: string,
  ): Promise<CandleResponse> {
    const suffix = exchange === "NSE" ? ".NS" : ".BO";
    const p1 = Math.floor(new Date(fromDate + "T00:00:00Z").getTime() / 1000);
    const p2 = Math.floor(new Date(toDate + "T00:00:00Z").getTime() / 1000) + 86400;
    let res: Response;
    try {
      res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol + suffix)}?period1=${p1}&period2=${p2}&interval=1d`,
        { headers: UA, signal: AbortSignal.timeout(30_000) },
      );
    } catch {
      throw new ProviderError("Yahoo chart unreachable.", "unavailable");
    }
    if (res.status === 404) throw new ProviderError("Symbol not found on Yahoo.", "not_found");
    if (res.status === 429) throw new ProviderError("Yahoo rate-limited.", "rate_limited");
    if (!res.ok) throw new ProviderError(`Yahoo error ${res.status}`, "bad_response");

    const body = (await res.json()) as {
      chart?: {
        result?: {
          timestamp?: number[];
          indicators?: {
            quote?: { open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }[];
          };
        }[];
        error?: { description?: string } | null;
      };
    };
    const result = body.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp || !quote) {
      throw new ProviderError(
        body.chart?.error?.description ?? "Yahoo returned no data.",
        "not_found",
      );
    }
    const candles: DailyCandle[] = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      const d = new Date(result.timestamp[i] * 1000);
      // Convert to IST trading date.
      const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
      candles.push({
        date: ist.toISOString().slice(0, 10),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: quote.volume?.[i] ?? 0,
      });
    }
    if (candles.length === 0) {
      throw new ProviderError("Yahoo returned no usable candles.", "not_found");
    }
    return {
      candles,
      source: "yahoo",
      adjusted: false,
      fetchedAt: new Date().toISOString(),
    };
  }
}
