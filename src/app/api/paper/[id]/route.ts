import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";

const patchSchema = z.object({
  action: z.enum(["open", "close", "cancel", "review"]),
  exitPrice: z.number().positive().optional(),
  exitReason: z.enum(["stop", "target1", "target2", "manual", "other"]).optional(),
  review: z.string().max(4000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }
  const trade = await db.paperTrade.findUnique({ where: { id }, include: { stock: true } });
  if (!trade) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const d = parsed.data;

  if (d.action === "open") {
    if (trade.status !== "planned") {
      return NextResponse.json({ ok: false, error: "Only planned trades can be opened." }, { status: 422 });
    }
    await db.paperTrade.update({
      where: { id },
      data: { status: "open", entryDate: new Date() },
    });
  } else if (d.action === "close") {
    if (trade.status !== "open") {
      return NextResponse.json({ ok: false, error: "Only open trades can be closed." }, { status: 422 });
    }
    if (d.exitPrice == null) {
      return NextResponse.json({ ok: false, error: "exitPrice required to close." }, { status: 422 });
    }
    await db.paperTrade.update({
      where: { id },
      data: {
        status: "closed",
        exitPrice: d.exitPrice,
        exitDate: new Date(),
        exitReason: d.exitReason ?? "manual",
      },
    });
  } else if (d.action === "cancel") {
    if (trade.status === "closed") {
      return NextResponse.json({ ok: false, error: "Closed trades cannot be cancelled." }, { status: 422 });
    }
    await db.paperTrade.update({ where: { id }, data: { status: "cancelled" } });
  } else if (d.action === "review") {
    await db.paperTrade.update({ where: { id }, data: { review: d.review ?? "" } });
  }
  const pnl =
    d.action === "close" && d.exitPrice != null && trade.entryPrice != null && trade.quantity != null
      ? (d.exitPrice - trade.entryPrice) * trade.quantity
      : null;
  const titles: Record<string, string> = {
    open: `Opened paper trade ${trade.stock.symbol}`,
    close: `Closed paper trade ${trade.stock.symbol}${pnl != null ? ` · ${pnl >= 0 ? "+" : ""}₹${pnl.toFixed(0)}` : ""}`,
    cancel: `Cancelled paper trade ${trade.stock.symbol}`,
    review: `Reviewed paper trade ${trade.stock.symbol}`,
  };
  await logActivity({
    kind: "paper",
    title: titles[d.action],
    detail: { action: d.action, tradeId: id, exitPrice: d.exitPrice ?? null, exitReason: d.exitReason ?? null, pnl },
    symbol: trade.stock.symbol,
    exchange: trade.stock.exchange,
    href: "/paper",
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = await db.paperTrade
    .findUnique({ where: { id }, include: { stock: true } })
    .catch(() => null);
  await db.paperTrade.delete({ where: { id } }).catch(() => {});
  if (existing) {
    await logActivity({
      kind: "paper",
      title: `Deleted paper trade ${existing.stock.symbol}`,
      detail: { action: "delete", tradeId: id },
      symbol: existing.stock.symbol,
      exchange: existing.stock.exchange,
      href: "/paper",
    });
  }
  return NextResponse.json({ ok: true });
}
