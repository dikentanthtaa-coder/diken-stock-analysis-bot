import "server-only";
import { env } from "@/lib/env";
import {
  type IntradayProvider,
  type IntradayResponse,
  type Interval,
  type Bar,
  ProviderError,
} from "./provider";
import { INTERVAL_SPEC } from "./intervals";

// Twelve Data (https://twelvedata.com) — licensed REST API with a free
// Basic tier (8 credits/min, 800/day) and documented NSE/BSE coverage.
// This adapter is activated only when TWELVEDATA_API_KEY is set and is
// UNVERIFIED until a key has been exercised (see Settings → health).

const BASE = "https://api.twelvedata.com";

const TD_INTERVAL: Record<Interval, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};

interface TdValue {
  datetime: string; // "2026-10-13 15:25:00" in exchange local time
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

interface TdBody {
  status?: string;
  code?: number;
  message?: string;
  meta?: { symbol?: string; interval?: string; currency?: string; exchange_timezone?: string; exchange?: string };
  values?: TdValue[];
}

export class TwelveDataProvider implements IntradayProvider {
  readonly id = "twelvedata";

  get configured(): boolean {
    return env.TWELVEDATA_API_KEY.length > 0;
  }

  async getIntradayBars(
    symbol: string,
    exchange: "NSE" | "BSE",
    interval: Interval,
  ): Promise<IntradayResponse> {
    if (!this.configured) {
      throw new ProviderError("Twelve Data key not configured.", "needs_key");
    }
    const params = new URLSearchParams({
      symbol,
      exchange,
      interval: TD_INTERVAL[interval],
      outputsize: "800",
      order: "ASC",
      timezone: "Asia/Kolkata",
      apikey: env.TWELVEDATA_API_KEY,
    });
    let res: Response;
    try {
      res = await fetch(`${BASE}/time_series?${params}`, {
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
    } catch {
      throw new ProviderError("Twelve Data unreachable.", "unavailable");
    }
    if (res.status === 429) throw new ProviderError("Twelve Data rate limit reached.", "rate_limited");
    if (res.status === 401 || res.status === 403) throw new ProviderError("Twelve Data rejected the API key.", "needs_key");
    if (!res.ok) throw new ProviderError(`Twelve Data error ${res.status}`, "bad_response");
    const body = (await res.json()) as TdBody;
    if (body.status === "error") {
      const code = body.code ?? 0;
      if (code === 429) throw new ProviderError(body.message ?? "Twelve Data rate limit.", "rate_limited");
      if (code === 401) throw new ProviderError(body.message ?? "Twelve Data key invalid.", "needs_key");
      if (code === 404 || code === 400) throw new ProviderError(body.message ?? "Symbol not found on Twelve Data.", "not_found");
      throw new ProviderError(body.message ?? "Twelve Data error.", "bad_response");
    }
    if (!Array.isArray(body.values) || body.values.length === 0) {
      throw new ProviderError("Twelve Data returned no bars.", "not_found");
    }
    const bars: Bar[] = [];
    for (const v of body.values) {
      // "YYYY-MM-DD HH:MM:SS" (or "YYYY-MM-DD" for daily) in IST.
      const iso = v.datetime.length === 10 ? `${v.datetime}T00:00:00+05:30` : `${v.datetime.replace(" ", "T")}+05:30`;
      const t = Math.floor(new Date(iso).getTime() / 1000);
      const o = Number(v.open), h = Number(v.high), l = Number(v.low), c = Number(v.close);
      if (![t, o, h, l, c].every(Number.isFinite)) continue;
      bars.push({ time: t, open: o, high: h, low: l, close: c, volume: Number(v.volume ?? 0) || 0 });
    }
    bars.sort((a, b) => a.time - b.time);
    const now = Date.now() / 1000;
    const last = bars.at(-1);
    return {
      interval,
      bars,
      lastBarForming: last != null && interval !== "1d" && now < last.time + INTERVAL_SPEC[interval].seconds,
      source: "twelvedata",
      fetchedAt: new Date().toISOString(),
      quote: {
        lastPrice: last?.close ?? null,
        lastTradeTime: last?.time ?? null,
        previousClose: null,
        declaredDelayMin: null, // depends on plan; not reported by the endpoint
        currency: body.meta?.currency ?? "INR",
        longName: null,
      },
    };
  }
}
