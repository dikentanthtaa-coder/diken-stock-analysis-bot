import { NextResponse } from "next/server";
import { z } from "zod";
import { getGateSettings, saveGateSettings } from "@/server/discipline/service";
import { logActivity } from "@/server/activity";

const schema = z.object({
  capital: z.number().positive().max(1e10),
  maxRiskPct: z.number().min(0.1).max(10),
  maxOpenPositions: z.number().int().min(1).max(50),
  dailyLossLimitPct: z.number().min(0.5).max(20),
  weeklyLossLimitPct: z.number().min(0.5).max(40),
});

export async function GET() {
  return NextResponse.json({ ok: true, settings: await getGateSettings() });
}

export async function PUT(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  await saveGateSettings(parsed.data);
  await logActivity({ kind: "planner", title: "Updated discipline rules", detail: parsed.data, href: "/settings" });
  return NextResponse.json({ ok: true, settings: parsed.data });
}
