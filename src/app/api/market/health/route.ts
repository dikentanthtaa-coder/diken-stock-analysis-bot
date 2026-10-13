import { NextResponse } from "next/server";
import { providerHealth } from "@/server/market/service";

export async function GET() {
  const checks = await providerHealth();
  return NextResponse.json({ ok: checks.some((c) => c.ok), checks });
}
