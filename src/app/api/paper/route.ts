import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

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
      thesis: d.thesis,
      analysisId: d.analysisId,
    },
  });
  return NextResponse.json({ ok: true, tradeId: trade.id });
}
