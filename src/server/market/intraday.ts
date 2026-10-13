import "server-only";
import { env } from "@/lib/env";
import { YahooProvider } from "./yahoo";
import { TwelveDataProvider } from "./twelvedata";
import {
  ProviderError,
  type IntradayProvider,
  type IntradayResponse,
  type Interval,
} from "./provider";
import { INTERVAL_SPEC, marketStateIST, type MarketState } from "./intervals";

// Intraday bars are NOT persisted (a 1-minute history for one symbol is
// thousands of rows a day). They live in a per-instance memory cache with a
// TTL tied to the interval; a 429 puts the provider in a cool-down and
// stale cache is served with an explicit "stale" status.

const yahoo = new YahooProvider();
const twelve = new TwelveDataProvider();

interface CacheEntry {
  data: IntradayResponse;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<IntradayResponse>>();
const cooldownUntil = new Map<string, number>();

const COOLDOWN_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;

export type DataStatus = "live" | "delayed" | "closed" | "stale" | "unavailable";

export interface IntradayFreshness {
  status: DataStatus;
  source: string;
  fetchedAt: string;
  servedFromCache: boolean;
  lastBarTime: number | null;
  lastBarForming: boolean;
  lastTradeTime: number | null;
  /** Seconds between the provider's last trade time and when we fetched. */
  observedLagSec: number | null;
  declaredDelayMin: number | null;
  marketState: MarketState;
  note: string;
}

export interface IntradayData {
  symbol: string;
  exchange: "NSE" | "BSE";
  interval: Interval;
  bars: IntradayResponse["bars"];
  quote: IntradayResponse["quote"];
  freshness: IntradayFreshness;
  warnings: string[];
}

function providersInOrder(): IntradayProvider[] {
  return twelve.configured ? [twelve, yahoo] : [yahoo];
}

function key(symbol: string, exchange: string, interval: Interval) {
  return `${exchange}:${symbol}:${interval}`;
}

async function fetchFresh(
  symbol: string,
  exchange: "NSE" | "BSE",
  interval: Interval,
  errors: string[],
): Promise<IntradayResponse | null> {
  for (const p of providersInOrder()) {
    const cd = cooldownUntil.get(p.id) ?? 0;
    if (cd > Date.now()) {
      errors.push(`${p.id}: cooling down after rate limit (${Math.ceil((cd - Date.now()) / 1000)}s)`);
      continue;
    }
    try {
      return await p.getIntradayBars(symbol, exchange, interval);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      errors.push(`${p.id}: ${msg}`);
      if (e instanceof ProviderError && e.kind === "rate_limited") {
        cooldownUntil.set(p.id, Date.now() + COOLDOWN_MS);
      }
      if (e instanceof ProviderError && e.kind === "not_found") {
        // An unknown symbol on one provider may exist on the other; try on.
        continue;
      }
    }
  }
  return null;
}

/**
 * Bars for one timeframe. Serves from memory while fresh, de-duplicates
 * concurrent requests, falls back to stale cache when providers fail, and
 * throws `ProviderError` only when nothing at all is available.
 */
export async function getIntradayBars(
  symbol: string,
  exchange: "NSE" | "BSE",
  interval: Interval,
): Promise<IntradayData> {
  const sym = symbol.toUpperCase().trim();
  const k = key(sym, exchange, interval);
  const now = Date.now();
  const hit = cache.get(k);
  const spec = INTERVAL_SPEC[interval];
  const state = marketStateIST();
  // Outside market hours nothing changes, so cache longer (but still
  // refresh so that a late print or a provider correction shows up).
  const ttl = state === "open" ? spec.cacheTtlMs : Math.max(spec.cacheTtlMs, 5 * 60_000);

  const warnings: string[] = [];
  let data: IntradayResponse | null = null;
  let servedFromCache = false;
  let stale = false;

  if (hit && hit.expiresAt > now) {
    data = hit.data;
    servedFromCache = true;
  } else {
    let p = inflight.get(k);
    if (!p) {
      const errors: string[] = [];
      p = (async () => {
        const fresh = await fetchFresh(sym, exchange, interval, errors);
        if (fresh) {
          cache.set(k, { data: fresh, expiresAt: Date.now() + ttl });
          if (cache.size > MAX_CACHE_ENTRIES) {
            const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
            if (oldest) cache.delete(oldest[0]);
          }
          return fresh;
        }
        if (hit) {
          // Stale fallback — keep the entry so later calls also get it.
          throw new StaleError(hit.data, errors);
        }
        const notFound = errors.every((e) => /not found|no usable|no bars|no data/i.test(e));
        throw new ProviderError(
          notFound
            ? `No market data for ${sym} on ${exchange}. Check the symbol. (${errors.join("; ")})`
            : `Market data unavailable for ${sym}: ${errors.join("; ")}`,
          notFound ? "not_found" : "unavailable",
        );
      })();
      inflight.set(k, p);
      p.finally(() => inflight.delete(k)).catch(() => {});
    }
    try {
      data = await p;
    } catch (e) {
      if (e instanceof StaleError) {
        data = e.data;
        servedFromCache = true;
        stale = true;
        warnings.push(`Providers failed (${e.errors.join("; ")}). Showing the last successful fetch.`);
      } else {
        throw e;
      }
    }
  }

  const last = data.bars.at(-1) ?? null;
  const fetchedAtSec = Math.floor(new Date(data.fetchedAt).getTime() / 1000);
  const lag = data.quote.lastTradeTime != null ? fetchedAtSec - data.quote.lastTradeTime : null;

  let status: DataStatus;
  let note: string;
  if (stale) {
    status = "stale";
    note = `Stale: last successful fetch ${fmtAge(now - new Date(data.fetchedAt).getTime())} ago.`;
  } else if (state !== "open") {
    status = "closed";
    note =
      state === "pre-open"
        ? "Market in pre-open session; bars are from the previous session."
        : "Market closed (regular hours 09:15–15:30 IST, Mon–Fri). Showing the last session.";
  } else if (data.quote.declaredDelayMin != null && data.quote.declaredDelayMin > 0) {
    status = "delayed";
    note = `Provider declares a ${data.quote.declaredDelayMin}-minute delay.`;
  } else if (lag != null && lag <= 180) {
    status = "live";
    note = `Live: provider's last trade was ${lag}s before fetch.`;
  } else if (lag != null) {
    status = "delayed";
    note = `Last trade reported ${fmtAge(lag * 1000)} before fetch — likely delayed, thin trading, or an exchange holiday.`;
  } else {
    status = "delayed";
    note = "Provider does not report trade time; treat as delayed.";
  }
  if (data.source === "yahoo") {
    warnings.push(
      "Yahoo Finance's public chart endpoint is undocumented and licensed for personal use; set TWELVEDATA_API_KEY for a licensed source.",
    );
  }
  if (data.bars.length < spec.minBars) {
    warnings.push(`Only ${data.bars.length} bars available on ${interval}; indicators need ≥ ${spec.minBars}.`);
  }

  return {
    symbol: sym,
    exchange,
    interval,
    bars: data.bars,
    quote: data.quote,
    freshness: {
      status,
      source: data.source,
      fetchedAt: data.fetchedAt,
      servedFromCache,
      lastBarTime: last?.time ?? null,
      lastBarForming: data.lastBarForming,
      lastTradeTime: data.quote.lastTradeTime,
      observedLagSec: lag,
      declaredDelayMin: data.quote.declaredDelayMin,
      marketState: state,
      note,
    },
    warnings,
  };
}

class StaleError extends Error {
  constructor(
    public readonly data: IntradayResponse,
    public readonly errors: string[],
  ) {
    super("stale");
  }
}

function fmtAge(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** Health probe for Settings. */
export async function intradayHealth() {
  const out: { id: string; ok: boolean; detail: string }[] = [];
  try {
    const r = await yahoo.getIntradayBars("RELIANCE", "NSE", "5m");
    out.push({ id: "yahoo-intraday", ok: true, detail: `OK — ${r.bars.length} × 5m bars, last ${new Date(r.bars.at(-1)!.time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` });
  } catch (e) {
    out.push({ id: "yahoo-intraday", ok: false, detail: e instanceof Error ? e.message : "failed" });
  }
  if (twelve.configured) {
    try {
      const r = await twelve.getIntradayBars("RELIANCE", "NSE", "5m");
      out.push({ id: "twelvedata", ok: true, detail: `OK — ${r.bars.length} × 5m bars` });
    } catch (e) {
      out.push({ id: "twelvedata", ok: false, detail: e instanceof Error ? e.message : "failed" });
    }
  } else {
    out.push({ id: "twelvedata", ok: false, detail: "not configured (optional; set TWELVEDATA_API_KEY) — adapter unverified" });
  }
  void env;
  return out;
}
