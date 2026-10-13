import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCandles } from "@/server/market/service";
import { analyze, type RuleMatchInput } from "@/server/analysis/engine";
import { ProviderError } from "@/server/market/provider";

export const maxDuration = 120;

const schema = z.object({
  symbol: z.string().min(1).max(30),
  exchange: z.enum(["NSE", "BSE"]),
  days: z.coerce.number().int().min(100).max(2000).default(400),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const { symbol, exchange, days, name } = parsed.data;
  try {
    const data = await getCandles(symbol, exchange, days, name);

    const dbRules = await db.strategyRule.findMany({
      where: { validation: { not: "conflicting" } },
      include: { video: { select: { title: true, url: true } } },
      take: 500,
    });
    const rules: RuleMatchInput[] = dbRules.map((r) => ({
      id: r.id,
      title: r.title,
      ruleText: r.ruleText,
      provenance: r.provenance,
      validation: r.validation,
      timestamp: r.timestamp,
      videoTitle: r.video?.title ?? null,
      videoUrl: r.video?.url ?? null,
    }));

    const report = analyze(data.candles, data.validation.warnings, rules);

    const saved = await db.analysis.create({
      data: {
        stockId: data.stockId,
        outcome: report.outcome,
        asOfDate: new Date(report.asOfDate === "n/a" ? Date.now() : report.asOfDate),
        report: JSON.stringify(report),
      },
    });

    return NextResponse.json({
      ok: true,
      analysisId: saved.id,
      stock: { symbol: data.symbol, exchange: data.exchange, name: data.name },
      freshness: data.freshness,
      report,
      candles: data.candles,
    });
  } catch (error) {
    const status = error instanceof ProviderError && error.kind === "not_found" ? 404 : 502;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status },
    );
  }
}
