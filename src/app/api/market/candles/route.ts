import { NextResponse } from "next/server";
import { z } from "zod";
import { getCandles } from "@/server/market/service";
import { ProviderError } from "@/server/market/provider";

const schema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  days: z.coerce.number().int().min(30).max(2000).default(400),
  name: z.string().optional(),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = schema.safeParse({
    symbol: sp.get("symbol"),
    exchange: sp.get("exchange"),
    days: sp.get("days") ?? undefined,
    name: sp.get("name") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  try {
    const data = await getCandles(
      parsed.data.symbol,
      parsed.data.exchange,
      parsed.data.days,
      parsed.data.name,
    );
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    const status = error instanceof ProviderError && error.kind === "not_found" ? 404 : 502;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status },
    );
  }
}
