import { NextResponse } from "next/server";
import { evaluatePendingSignals, getLiveRecord } from "@/server/signal/postmortem";

export const maxDuration = 60;

/** Live record of emitted signals. Grades pending ones first (cheap: one
 *  bar fetch per symbol/timeframe, served from the intraday cache). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = sp.get("symbol")?.toUpperCase() ?? undefined;
  const exchange = sp.get("exchange") ?? undefined;
  const interval = sp.get("interval") ?? undefined;
  let graded = 0;
  try {
    graded = await evaluatePendingSignals();
  } catch (e) {
    console.error("[record] evaluation failed", e);
  }
  const record = await getLiveRecord({ symbol, exchange, interval, take: Number(sp.get("take") ?? 25) });
  return NextResponse.json({ ok: true, graded, ...record });
}
