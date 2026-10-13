import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

async function defaultWatchlist() {
  return db.watchlist.upsert({
    where: { name: "Default" },
    update: {},
    create: { name: "Default" },
  });
}

export async function GET() {
  const wl = await defaultWatchlist();
  const items = await db.watchlistItem.findMany({
    where: { watchlistId: wl.id },
    include: {
      stock: {
        include: {
          candles: { orderBy: { date: "desc" }, take: 2 },
          analyses: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });
  return NextResponse.json({
    ok: true,
    items: items.map((i) => {
      const [last, prev] = i.stock.candles;
      return {
        id: i.id,
        symbol: i.stock.symbol,
        exchange: i.stock.exchange,
        name: i.stock.name,
        note: i.note,
        lastClose: last?.close ?? null,
        lastDate: last?.date.toISOString().slice(0, 10) ?? null,
        changePct:
          last && prev ? ((last.close - prev.close) / prev.close) * 100 : null,
        lastOutcome: i.stock.analyses[0]?.outcome ?? null,
      };
    }),
  });
}

const addSchema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  name: z.string().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }
  const { symbol, exchange, name, note } = parsed.data;
  const wl = await defaultWatchlist();
  const stock = await db.stock.upsert({
    where: { symbol_exchange: { symbol: symbol.toUpperCase(), exchange } },
    update: {},
    create: { symbol: symbol.toUpperCase(), exchange, name: name ?? symbol.toUpperCase() },
  });
  const item = await db.watchlistItem.upsert({
    where: { watchlistId_stockId: { watchlistId: wl.id, stockId: stock.id } },
    update: { note: note ?? undefined },
    create: { watchlistId: wl.id, stockId: stock.id, note },
  });
  return NextResponse.json({ ok: true, itemId: item.id });
}

const delSchema = z.object({ itemId: z.string().min(1) });

export async function DELETE(req: Request) {
  const parsed = delSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }
  await db.watchlistItem.delete({ where: { id: parsed.data.itemId } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
