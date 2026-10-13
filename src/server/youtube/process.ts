import "server-only";
import { db } from "@/lib/db";
import { fetchTranscript } from "./transcripts";

/**
 * Process one video: fetch and store its transcript, updating status
 * honestly at each step. Status transitions:
 *   Pending/Failed/TranscriptUnavailable -> Processing -> Completed
 *                                         |-> TranscriptUnavailable
 *                                         |-> Failed
 */
export async function processVideo(videoId: string) {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) throw new Error("Video not found");

  await db.video.update({
    where: { id: videoId },
    data: { status: "Processing", statusNote: null },
  });

  const result = await fetchTranscript(video.youtubeId);

  if (!result.ok) {
    const status = result.kind === "unavailable" ? "TranscriptUnavailable" : "Failed";
    await db.video.update({
      where: { id: videoId },
      data: { status, statusNote: result.message },
    });
    return { status, message: result.message };
  }

  await db.transcript.upsert({
    where: { videoId },
    update: { language: result.language, origin: "auto", content: result.text },
    create: {
      videoId,
      language: result.language,
      origin: "auto",
      content: result.text,
    },
  });

  await db.video.update({
    where: { id: videoId },
    data: { status: "Completed", statusNote: null, processedAt: new Date() },
  });

  return { status: "Completed" as const, segments: result.segments.length };
}

/** Import an authorized transcript the user provides manually. */
export async function importManualTranscript(
  videoId: string,
  content: string,
  language: string,
) {
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) throw new Error("Video not found");

  await db.transcript.upsert({
    where: { videoId },
    update: { language, origin: "manual", content },
    create: { videoId, language, origin: "manual", content },
  });

  await db.video.update({
    where: { id: videoId },
    data: { status: "Completed", statusNote: "Manual import", processedAt: new Date() },
  });
}
