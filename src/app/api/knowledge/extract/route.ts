import { NextResponse } from "next/server";
import { logActivity } from "@/server/activity";
import { z } from "zod";
import { runExtraction } from "@/server/knowledge/service";

export const maxDuration = 300;

const schema = z.object({ useAi: z.boolean().default(false) });

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }
  try {
    const summary = await runExtraction(body.data.useAi);
    await logActivity({
      kind: "knowledge",
      title: `Ran extraction · ${summary.conceptsUpserted} concepts · ${summary.candidateRules + summary.aiRules} rules from ${summary.videosScanned} videos`,
      detail: { ...summary },
      href: "/knowledge",
    });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
