import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { importManualTranscript } from "@/server/youtube/process";

const importSchema = z.object({
  content: z.string().min(50, "Transcript looks too short"),
  language: z.string().min(2).max(10).default("hi"),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const video = await db.video.findUnique({
    where: { id },
    include: { transcript: true, playlist: { select: { title: true } } },
  });
  if (!video) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, video });
}

/** Manual import of an authorized transcript. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = importSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { ok: false, error: body.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  try {
    await importManualTranscript(id, body.data.content, body.data.language);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
