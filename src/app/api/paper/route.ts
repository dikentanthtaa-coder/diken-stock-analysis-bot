import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { checkTrade } from "@/server/discipline/service";

export async function GET() {
  const trades = await db.paperTrade.findMany({
    include: { stock: { select: { symbol: true, exchange: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ok: true, trades });
}

const createSchema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  target1: z.number().positive().nullish(),
  target2: z.number().positive().nullish(),
  quantity: z.number().int().positive(),
  thesis: z.string().max(2000).optional(),
  status: z.enum(["planned", "open"]).default("open"),
  analysisId: z.string().optional(),
  // Pre-trade gate: warnings must be acknowledged; hard fails cannot be overridden.
  acknowledge: z.boolean().default(false),
  signal: z.enum(["BUY", "SELL", "HOLD"]).nullish(),
  dataStatus: z.string().max(20).nullish(),
  atr: z.number().positive().nullish(),
});

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const d = parsed.data;
  if (d.stopLoss >= d.entryPrice) {
    return NextResponse.json(
      { ok: false, error: "Stop-loss must be below entry for a long paper trade." },
      { status: 422 },
    );
  }
  const gate = await checkTrade({
    direction: "long",
    entry: d.entryPrice,
    stop: d.stopLoss,
    target1: d.target1 ?? null,
    quantity: d.quantity,
    signal: d.signal ?? null,
    dataStatus: d.dataStatus ?? null,
    atr: d.atr ?? null,
    thesis: d.thesis ?? null,
  });
  if (gate.result.verdict === "blocked") {
    return NextResponse.json(
      { ok: false, error: `Pre-trade gate blocked this trade. ${gate.result.summary}`, gate: gate.result },
      { status: 422 },
    );
  }
  if (gate.result.verdict === "caution" && !d.acknowledge) {
    return NextResponse.json(
      { ok: false, error: "Pre-trade gate has warnings; acknowledge them to record the trade.", gate: gate.result, needsAcknowledge: true },
      { status: 409 },
    );
  }
  const stock = await db.stock.upsert({
    where: { symbol_exchange: { symbol: d.symbol.toUpperCase(), exchange: d.exchange } },
    update: {},
    create: { symbol: d.symbol.toUpperCase(), exchange: d.exchange, name: d.symbol.toUpperCase() },
  });
  const trade = await db.paperTrade.create({
    data: {
      stockId: stock.id,
      direction: "long",
      status: d.status,
      entryPrice: d.entryPrice,
      entryDate: d.status === "open" ? new Date() : null,
      stopLoss: d.stopLoss,
      target1: d.target1 ?? null,
      target2: d.target2 ?? null,
      quantity: d.quantity,
      thesis: [d.thesis, `[Gate: ${gate.result.verdict}${gate.result.verdict === "caution" ? ", warnings acknowledged" : ""} · risk ${gate.result.riskPct.toFixed(2)}%${gate.result.rewardRisk != null ? ` · R:R ${gate.result.rewardRisk.toFixed(2)}` : ""}]`]
        .filter(Boolean)
        .join("\n"),
      analysisId: d.analysisId,
    },
  });
  await logActivity({
    kind: "paper",
    title: `${d.status === "open" ? "Opened" : "Planned"} paper trade ${stock.symbol} · ${d.quantity} @ ₹${d.entryPrice}`,
    detail: {
      action: d.status,
      tradeId: trade.id,
      entryPrice: d.entryPrice,
      stopLoss: d.stopLoss,
      target1: d.target1 ?? null,
      target2: d.target2 ?? null,
      quantity: d.quantity,
      gate: gate.result.verdict,
      riskPct: gate.result.riskPct,
    },
    symbol: stock.symbol,
    exchange: stock.exchange,
    href: "/paper",
  });
  return NextResponse.json({ ok: true, tradeId: trade.id, gate: gate.result });
}
