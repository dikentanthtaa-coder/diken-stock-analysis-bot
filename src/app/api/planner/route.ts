import { NextResponse } from "next/server";
import { z } from "zod";
import { planLongTrade } from "@/server/planner/calc";

const schema = z.object({
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  target1: z.number().positive().nullish(),
  target2: z.number().positive().nullish(),
  budget: z.number().positive(),
  riskBudget: z.number().positive(),
  costFactor: z.number().min(1).max(1.1).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  const result = planLongTrade(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
