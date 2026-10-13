import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { TejHqProvider } from "./tejhq";
import { YahooProvider } from "./yahoo";
import { validateCandles } from "./validate";
import {
  ProviderError,
  type MarketDataProvider,
  type SymbolResult,
} from "./provider";

const tejhq = new TejHqProvider();
const yahoo = new YahooProvider();

function primaryProvider(): MarketDataProvider {
  return env.MARKET_DATA_PROVIDER === "yahoo" ? yahoo : tejhq;
}
function fallbackProvider(): MarketDataProvider {
  return env.MARKET_DATA_PROVIDER === "yahoo" ? tejhq : yahoo;
}

export async function searchStocks(query: string): Promise<SymbolResult[]> {
  return yahoo.searchSymbols(query);
}

export interface CandleData {
  stockId: string;
  symbol: string;
  exchange: "NSE" | "BSE";
  name: string;
  candles: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  freshness: {
    source: string;
    fetchedAt: string;
    isRealtime: false;
    lastCandleDate: string | null;
    adjusted: boolean;
    note: string;
  };
  validation: {
    warnings: string[];
    possibleGaps: number;
    rejected: number;
  };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Return daily candles for a stock, serving from the local cache and
 * fetching from the provider when the cache is stale or too short.
 * Cache policy: refetch when the newest cached candle is older than 1 day
 * (data is EOD) or when fewer candles than requested exist.
 */
export async function getCandles(
  symbol: string,
  exchange: "NSE" | "BSE",
  days: number,
  name?: string,
): Promise<CandleData> {
  const sym = symbol.toUpperCase().trim();
  const fromDate = isoDaysAgo(days);
  const toDate = new Date().toISOString().slice(0, 10);

  let stock = await db.stock.findUnique({
    where: { symbol_exchange: { symbol: sym, exchange } },
  });

  const cached = stock
    ? await db.candle.findMany({
        where: { stockId: stock.id, date: { gte: new Date(fromDate) } },
        orderBy: { date: "asc" },
      })
    : [];

  const newest = cached.at(-1);
  const newestAge = newest
    ? (Date.now() - newest.date.getTime()) / 86_400_000
    : Infinity;
  // EOD data: consider fresh if newest candle is <= ~1.2 days old on a
  // weekday basis (weekends make the newest trading day up to 3 days old).
  const now = new Date();
  const dow = now.getUTCDay();
  const staleThreshold = dow === 0 || dow === 6 || dow === 1 ? 4 : 2;
  // Also refetch when the cache doesn't reach far enough back for this
  // request (oldest cached candle starts >10 days after fromDate).
  const oldestGapDays = cached.length
    ? (cached[0].date.getTime() - new Date(fromDate + "T00:00:00Z").getTime()) /
      86_400_000
    : Infinity;
  const needsFetch =
    cached.length < 5 || newestAge > staleThreshold || oldestGapDays > 10;

  let source = newest ? cached[0].source : "cache";
  let fetchedAt = newest?.fetchedAt.toISOString() ?? new Date().toISOString();
  let adjusted = false;
  const warnings: string[] = [];
  let possibleGaps = 0;
  let rejectedCount = 0;

  if (needsFetch) {
    let response;
    const providerErrors: string[] = [];
    for (const provider of [primaryProvider(), fallbackProvider()]) {
      try {
        response = await provider.getDailyCandles(sym, exchange, fromDate, toDate);
        break;
      } catch (e) {
        providerErrors.push(
          `${provider.id}: ${e instanceof Error ? e.message : "failed"}`,
        );
        if (e instanceof ProviderError && e.kind === "not_found") {
          // try fallback — symbol may exist on the other provider
          continue;
        }
      }
    }
    if (!response) {
      if (cached.length > 0 && stock) {
        warnings.push(
          `Providers unavailable (${providerErrors.join("; ")}). Serving cached data.`,
        );
      } else {
        throw new ProviderError(
          `No data available for ${sym} (${exchange}). ${providerErrors.join("; ")}`,
          "unavailable",
        );
      }
    }

    if (response) {
      const report = validateCandles(response.candles);
      warnings.push(...report.warnings);
      possibleGaps = report.possibleGaps.length;
      rejectedCount = report.rejected.length;

      stock ??= await db.stock.create({
        data: { symbol: sym, exchange, name: name ?? sym },
      });

      for (const c of report.valid) {
        await db.candle.upsert({
          where: { stockId_date: { stockId: stock.id, date: new Date(c.date) } },
          update: {
            open: c.open, high: c.high, low: c.low, close: c.close,
            volume: c.volume, source: response.source, fetchedAt: new Date(),
          },
          create: {
            stockId: stock.id,
            date: new Date(c.date),
            open: c.open, high: c.high, low: c.low, close: c.close,
            volume: c.volume, source: response.source,
          },
        });
      }
      await db.dataCoverage.upsert({
        where: { stockId: stock.id },
        update: {
          provider: response.source,
          firstDate: new Date(report.valid[0].date),
          lastDate: new Date(report.valid.at(-1)!.date),
          candleCount: report.valid.length,
          lastSync: new Date(),
          lastError: null,
        },
        create: {
          stockId: stock.id,
          provider: response.source,
          firstDate: new Date(report.valid[0].date),
          lastDate: new Date(report.valid.at(-1)!.date),
          candleCount: report.valid.length,
          lastSync: new Date(),
        },
      });
      source = response.source;
      fetchedAt = response.fetchedAt;
      adjusted = response.adjusted;
    }
  }

  if (!stock) {
    throw new ProviderError(`Unknown stock ${sym} (${exchange}).`, "not_found");
  }

  const rows = await db.candle.findMany({
    where: { stockId: stock.id, date: { gte: new Date(fromDate) } },
    orderBy: { date: "asc" },
  });

  const lastCandleDate = rows.at(-1)?.date.toISOString().slice(0, 10) ?? null;
  if (!adjusted) {
    warnings.push(
      "Prices are unadjusted bhavcopy values; splits/bonuses appear as artificial jumps. Check corporate actions before trusting long histories.",
    );
  }

  return {
    stockId: stock.id,
    symbol: sym,
    exchange,
    name: stock.name,
    candles: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
    })),
    freshness: {
      source,
      fetchedAt,
      isRealtime: false,
      lastCandleDate,
      adjusted,
      note: "End-of-day data. Not real-time.",
    },
    validation: { warnings, possibleGaps, rejected: rejectedCount },
  };
}

export async function getCorporateActions(symbol: string) {
  return tejhq.getCorporateActions(symbol.toUpperCase().trim());
}

/** Provider health for the dashboard/settings pages. */
export async function providerHealth() {
  const checks: { id: string; ok: boolean; detail: string }[] = [];
  try {
    const r = await tejhq.getDailyCandles("RELIANCE", "NSE", isoDaysAgo(10), new Date().toISOString().slice(0, 10));
    checks.push({ id: "tejhq", ok: true, detail: `OK — last candle ${r.candles.at(-1)?.date}` });
  } catch (e) {
    checks.push({ id: "tejhq", ok: false, detail: e instanceof Error ? e.message : "failed" });
  }
  try {
    const r = await yahoo.searchSymbols("RELIANCE");
    checks.push({ id: "yahoo", ok: r.length > 0, detail: `search OK (${r.length} results)` });
  } catch (e) {
    checks.push({ id: "yahoo", ok: false, detail: e instanceof Error ? e.message : "failed" });
  }
  return checks;
}
