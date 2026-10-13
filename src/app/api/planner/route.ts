import { NextResponse } from "next/server";
import { logActivity } from "@/server/activity";
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
  if (result.ok) {
    await logActivity({
      kind: "planner",
      title: `Planned trade · entry ₹${parsed.data.entryPrice} · stop ₹${parsed.data.stopLoss} · qty ${result.finalQty}`,
      detail: {
        input: parsed.data,
        finalQty: result.finalQty,
        capitalRequired: result.capitalRequired,
        plannedLossAtStop: result.plannedLossAtStop,
        riskRewardT1: result.riskRewardT1,
      },
      href: "/planner",
    });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
