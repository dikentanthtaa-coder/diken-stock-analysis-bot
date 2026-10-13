import { NextResponse } from "next/server";
import { z } from "zod";
import { checkTrade } from "@/server/discipline/service";

export const gateSchema = z.object({
  direction: z.enum(["long", "short"]).default("long"),
  entry: z.number().positive(),
  stop: z.number().positive(),
  target1: z.number().positive().nullish(),
  quantity: z.number().int().positive().optional(),
  signal: z.enum(["BUY", "SELL", "HOLD"]).nullish(),
  signalConfidence: z.number().min(0).max(100).nullish(),
  dailyTrend: z.enum(["uptrend", "downtrend", "sideways"]).nullish(),
  dataStatus: z.string().max(20).nullish(),
  atr: z.number().positive().nullish(),
  thesis: z.string().max(2000).nullish(),
});

export async function POST(req: Request) {
  const parsed = gateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const out = await checkTrade({ ...d, quantity: d.quantity ?? 0, target1: d.target1 ?? null });
  return NextResponse.json({ ok: true, ...out });
}
