import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/server/activity";
import { processVideo } from "@/server/youtube/process";

export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await processVideo(id);
    const video = await db.video.findUnique({ where: { id }, select: { title: true } });
    await logActivity({
      kind: "learning",
      title: `${result.status === "Completed" ? "Processed" : `Transcript ${result.status}`} · ${video?.title ?? id}`,
      detail: { videoId: id, ...result },
      href: "/learning",
    });
    return NextResponse.json({ ok: result.status === "Completed", ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
