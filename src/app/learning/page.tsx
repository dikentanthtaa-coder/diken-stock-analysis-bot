export const metadata = { title: "Learning" };
import { db } from "@/lib/db";
import { REQUIRED_PLAYLISTS, CHANNEL_URL } from "@/server/youtube/config";
import { Suspense } from "react";
import { LearningClient } from "./ui";
import { PageLoader } from "../loader";

export default function LearningPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading learning" />}>
      <LearningContent />
    </Suspense>
  );
}

async function LearningContent() {
  const playlists = await db.playlist.findMany({
    include: {
      videos: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          youtubeId: true,
          title: true,
          url: true,
          durationSec: true,
          status: true,
          statusNote: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">YouTube Learning</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Source:{" "}
        <a href={CHANNEL_URL} className="underline" target="_blank">
          GTF — A Stock Market Institute
        </a>
        . Transcripts are fetched from available caption tracks (mostly Hindi
        auto-captions) or imported manually.
      </p>
      <LearningClient
        playlists={playlists.map((p) => ({
          id: p.id,
          title: p.title,
          url: p.url,
          videoCount: p.videoCount,
          lastSynced: p.lastSynced?.toISOString() ?? null,
          videos: p.videos,
        }))}
        requiredCount={REQUIRED_PLAYLISTS.length}
      />
    </main>
  );
}
