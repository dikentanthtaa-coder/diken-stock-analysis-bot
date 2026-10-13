import "server-only";
import { getIntradayBars } from "./intraday";
import { assessRegime, type MarketRegime } from "./regime-calc";

// Market posture for NSE, built from NIFTY 50 (trend + distribution days),
// NIFTY 500 (breadth proxy) and India VIX. Cached for 10 minutes; index
// bars come through the same intraday provider path (keyless Yahoo).

let cached: { at: number; value: MarketRegime } | null = null;
const TTL = 10 * 60_000;

export async function getMarketRegime(): Promise<MarketRegime> {
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  const [nifty, n500, vix] = await Promise.allSettled([
    getIntradayBars("^NSEI", "NSE", "1d"),
    getIntradayBars("^CRSLDX", "NSE", "1d"),
    getIntradayBars("^INDIAVIX", "NSE", "1d"),
  ]);
  if (nifty.status === "rejected") throw nifty.reason;
  const value = assessRegime({
    nifty: nifty.value.bars,
    niftyForming: nifty.value.freshness.lastBarForming,
    nifty500: n500.status === "fulfilled" ? n500.value.bars : null,
    vix: vix.status === "fulfilled" ? vix.value.bars : null,
    fetchedAt: nifty.value.freshness.fetchedAt,
    status: nifty.value.freshness.status,
    source: nifty.value.freshness.source,
  });
  cached = { at: Date.now(), value };
  return value;
}
