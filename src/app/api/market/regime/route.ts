import { NextResponse } from "next/server";
import { getMarketRegime } from "@/server/market/regime";

export async function GET() {
  try {
    const regime = await getMarketRegime();
    return NextResponse.json({ ok: true, regime });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 502 },
    );
  }
}
