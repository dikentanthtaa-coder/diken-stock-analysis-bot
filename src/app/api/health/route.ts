import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Round-trip write + read to prove the DB works.
    await db.setting.upsert({
      where: { key: "health:lastCheck" },
      update: { value: JSON.stringify(new Date().toISOString()) },
      create: {
        key: "health:lastCheck",
        value: JSON.stringify(new Date().toISOString()),
      },
    });

    const [settings, stocks, playlists, videos] = await Promise.all([
      db.setting.count(),
      db.stock.count(),
      db.playlist.count(),
      db.video.count(),
    ]);

    return NextResponse.json({
      ok: true,
      database: "postgres",
      counts: { settings, stocks, playlists, videos },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
