import { NextResponse } from "next/server";
import { logActivity } from "@/server/activity";
import { syncRequiredPlaylists } from "@/server/youtube/inventory";

export const maxDuration = 300;

export async function POST() {
  try {
    const results = await syncRequiredPlaylists();
    const ok = results.every((r) => !r.error);
    const added = results.reduce((n, r) => n + r.added, 0);
    await logActivity({
      kind: "learning",
      title: `Synced ${results.length} playlists · ${added} new videos`,
      detail: { results },
      href: "/learning",
    });
    return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
