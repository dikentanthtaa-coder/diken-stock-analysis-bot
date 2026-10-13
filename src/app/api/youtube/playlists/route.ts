import { NextResponse } from "next/server";
import { connection } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  await connection();
  const playlists = await db.playlist.findMany({
    include: {
      videos: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          youtubeId: true,
          title: true,
          url: true,
          position: true,
          durationSec: true,
          status: true,
          statusNote: true,
          processedAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ playlists });
}
