import "server-only";
import { env } from "@/lib/env";
import {
  type MarketDataProvider,
  type CandleResponse,
  type DailyCandle,
  ProviderError,
} from "./provider";

// TejHQ (https://tejhq.dev) — open EOD data for NSE/BSE, updated ~18:30 IST
// on trading days. The /v1/ohlcv endpoint is keyless on the Open tier
// (verified 2026-10-11); a free key raises limits and unlocks /v1/adjusted.

const BASE = "https://api.tejhq.dev";

interface TejOhlcvRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function tejFetch(path: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.MARKET_DATA_API_KEY) {
    headers.Authorization = `Bearer ${env.MARKET_DATA_API_KEY}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new ProviderError(
      `TejHQ unreachable: ${e instanceof Error ? e.message : "network error"}`,
      "unavailable",
    );
  }
  if (res.status === 429) {
    throw new ProviderError("TejHQ rate limit reached for today.", "rate_limited");
  }
  if (res.status === 401 || res.status === 402) {
    throw new ProviderError(
      "This TejHQ endpoint needs an API key (free at tejhq.dev/keys).",
      "needs_key",
    );
  }
  if (res.status === 404) {
    throw new ProviderError("Symbol not found on TejHQ.", "not_found");
  }
  if (!res.ok) {
    throw new ProviderError(`TejHQ error ${res.status}`, "bad_response");
  }
  return res;
}

export class TejHqProvider implements MarketDataProvider {
  readonly id = "tejhq";

  async getDailyCandles(
    symbol: string,
    exchange: "NSE" | "BSE",
    fromDate: string,
    toDate: string,
  ): Promise<CandleResponse> {
    const res = await tejFetch(
      `/v1/ohlcv/${exchange}/${encodeURIComponent(symbol)}?from=${fromDate}&to=${toDate}`,
    );
    const body = (await res.json()) as { data?: TejOhlcvRow[] };
    if (!Array.isArray(body.data)) {
      throw new ProviderError("TejHQ returned an unexpected shape.", "bad_response");
    }
    if (body.data.length === 0) {
      throw new ProviderError(
        "TejHQ returned no rows (unknown symbol or no trading days in range).",
        "not_found",
      );
    }
    const candles: DailyCandle[] = body.data.map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));
    return {
      candles,
      source: "tejhq",
      adjusted: false, // open tier serves unadjusted bhavcopy prices
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Corporate actions (keyless). Used to warn about unadjusted history. */
  async getCorporateActions(symbol: string): Promise<
    { exDate: string; type: string; subject: string }[]
  > {
    const res = await tejFetch(`/v1/actions/${encodeURIComponent(symbol)}`);
    const body = (await res.json()) as {
      data?: { ex_date: string; type: string; raw_subject?: string }[];
    };
    return (body.data ?? []).map((a) => ({
      exDate: a.ex_date,
      type: a.type,
      subject: a.raw_subject ?? a.type,
    }));
  }
}
