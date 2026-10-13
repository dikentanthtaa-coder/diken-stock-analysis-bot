import { NextResponse } from "next/server";
import { syncRequiredPlaylists } from "@/server/youtube/inventory";

export const maxDuration = 300;

export async function POST() {
  try {
    const results = await syncRequiredPlaylists();
    const ok = results.every((r) => !r.error);
    return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
