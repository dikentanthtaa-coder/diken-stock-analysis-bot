import "server-only";
import { Innertube } from "youtubei.js";
import { db } from "@/lib/db";
import { REQUIRED_PLAYLISTS, CHANNEL, playlistUrl, videoUrl } from "./config";

let innertube: Promise<Innertube> | null = null;
function getInnertube() {
  innertube ??= Innertube.create({ lang: "en", location: "IN" });
  return innertube;
}

export interface SyncResult {
  playlistId: string;
  title: string;
  videoCount: number;
  added: number;
  error?: string;
}

/** Fetch a playlist's current videos from YouTube and upsert into the DB. */
export async function syncPlaylist(youtubeId: string): Promise<SyncResult> {
  const yt = await getInnertube();
  const pl = await yt.getPlaylist(youtubeId);
  const title = pl.info.title ?? youtubeId;

  const videos: {
    id: string;
    title: string;
    position: number;
    durationSec: number | null;
  }[] = [];

  let page: Awaited<ReturnType<typeof yt.getPlaylist>> | typeof pl = pl;
  // Paginate (50 per page) until exhausted.
  for (;;) {
    for (const v of page.videos) {
      // Two formats in the wild: classic PlaylistVideo (id/title/duration)
      // and newer LockupView (content_id, metadata.title, badge duration).
      const node = v as unknown as {
        id?: string;
        content_id?: string;
        title?: { text?: string };
        metadata?: { title?: { text?: string } };
        duration?: { seconds?: number };
        content_image?: unknown;
      };
      const id = node.id ?? node.content_id;
      if (!id) continue;
      let durationSec = node.duration?.seconds ?? null;
      if (durationSec == null && node.content_image) {
        const badge = JSON.stringify(node.content_image).match(
          /"text":"(?:(\d+):)?(\d+):(\d+)"/,
        );
        if (badge) {
          durationSec =
            Number(badge[1] ?? 0) * 3600 +
            Number(badge[2]) * 60 +
            Number(badge[3]);
        }
      }
      videos.push({
        id,
        title: node.title?.text ?? node.metadata?.title?.text ?? id,
        position: videos.length,
        durationSec,
      });
    }
    if (!page.has_continuation) break;
    page = await page.getContinuation();
  }

  const playlist = await db.playlist.upsert({
    where: { youtubeId },
    update: { title, videoCount: videos.length, lastSynced: new Date() },
    create: {
      youtubeId,
      title,
      channel: CHANNEL,
      url: playlistUrl(youtubeId),
      videoCount: videos.length,
      lastSynced: new Date(),
    },
  });

  let added = 0;
  for (const v of videos) {
    const existing = await db.video.findUnique({
      where: {
        playlistId_youtubeId: { playlistId: playlist.id, youtubeId: v.id },
      },
    });
    if (existing) {
      await db.video.update({
        where: { id: existing.id },
        data: { title: v.title, position: v.position, durationSec: v.durationSec },
      });
    } else {
      await db.video.create({
        data: {
          playlistId: playlist.id,
          youtubeId: v.id,
          title: v.title,
          url: videoUrl(v.id),
          position: v.position,
          durationSec: v.durationSec,
          status: "Pending",
        },
      });
      added++;
    }
  }

  return { playlistId: youtubeId, title, videoCount: videos.length, added };
}

/** Sync all three required playlists. Collects per-playlist errors. */
export async function syncRequiredPlaylists(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const p of REQUIRED_PLAYLISTS) {
    try {
      results.push(await syncPlaylist(p.youtubeId));
    } catch (error) {
      results.push({
        playlistId: p.youtubeId,
        title: p.title,
        videoCount: 0,
        added: 0,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
  return results;
}
