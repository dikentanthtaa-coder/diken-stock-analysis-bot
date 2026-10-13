import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiProvider } from "@/server/ai/adapter";
import { buildNarrativePrompt } from "@/server/signal/narrative";
import type { SignalReport } from "@/server/signal/engine";

export const maxDuration = 120;

const schema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  name: z.string().max(120),
  interval: z.string().max(4),
  lastPrice: z.number().nullable(),
  freshnessNote: z.string().max(300),
  source: z.string().max(40),
  report: z.custom<SignalReport>((v) => typeof v === "object" && v !== null && "signal" in (v as object)),
});

/** Optional AI narrative over the engine's own numbers. The explanation never
 *  changes the signal; it only restates the evidence in prose. */
export async function POST(req: Request) {
  const ai = getAiProvider();
  if (!ai.available) {
    return NextResponse.json({ ok: false, error: "No AI provider configured (set AI_PROVIDER=claude and AI_API_KEY)." }, { status: 503 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  try {
    const text = await ai.explain(buildNarrativePrompt(parsed.data));
    return NextResponse.json({ ok: true, provider: ai.id, text });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI request failed." }, { status: 502 });
  }
}
