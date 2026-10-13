import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const patchSchema = z.object({
  title: z.string().min(3).optional(),
  ruleText: z.string().min(3).optional(),
  validation: z.enum(["unvalidated", "backtested", "conflicting", "ambiguous"]).optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }
  try {
    const rule = await db.strategyRule.update({ where: { id }, data: body.data });
    return NextResponse.json({ ok: true, rule });
  } catch {
    return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await db.strategyRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
  }
}
