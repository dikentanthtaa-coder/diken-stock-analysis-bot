import { NextResponse } from "next/server";
import { logActivity } from "@/server/activity";
import { searchKnowledge } from "@/server/knowledge/service";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const results = await searchKnowledge(q);
  if (q.length >= 3) {
    await logActivity({
      kind: "search",
      title: `Searched knowledge base for "${q}"`,
      detail: {
        scope: "knowledge",
        query: q,
        concepts: results.concepts.length,
        rules: results.rules.length,
        transcripts: results.transcripts.length,
      },
      href: `/knowledge?q=${encodeURIComponent(q)}`,
    });
  }
  return NextResponse.json({ ok: true, q, ...results });
}
