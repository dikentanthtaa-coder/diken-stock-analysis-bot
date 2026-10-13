import { NextResponse } from "next/server";
import { searchKnowledge } from "@/server/knowledge/service";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const results = await searchKnowledge(q);
  return NextResponse.json({ ok: true, q, ...results });
}
