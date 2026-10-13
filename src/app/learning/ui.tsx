"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface VideoRow {
  id: string;
  youtubeId: string;
  title: string;
  url: string;
  durationSec: number | null;
  status: string;
  statusNote: string | null;
}

interface PlaylistRow {
  id: string;
  title: string;
  url: string;
  videoCount: number;
  lastSynced: string | null;
  videos: VideoRow[];
}

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-zinc-100 text-zinc-700",
  Processing: "bg-blue-100 text-blue-800",
  Completed: "bg-emerald-100 text-emerald-800",
  TranscriptUnavailable: "bg-amber-100 text-amber-800",
  Failed: "bg-red-100 text-red-800",
};

function fmtDuration(sec: number | null) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LearningClient({
  playlists,
  requiredCount,
}: {
  playlists: PlaylistRow[];
  requiredCount: number;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{
    title: string;
    content: string;
    origin: string;
    language: string;
  } | null>(null);
  const [importing, setImporting] = useState<VideoRow | null>(null);
  const [importText, setImportText] = useState("");

  async function syncAll() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/youtube/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMessage("Playlists synced.");
      } else {
        const errs = (data.results ?? [])
          .filter((r: { error?: string }) => r.error)
          .map((r: { title: string; error: string }) => `${r.title}: ${r.error}`)
          .join(" | ");
        setMessage(`Sync finished with errors: ${errs || data.error}`);
      }
      router.refresh();
    } catch {
      setMessage("Sync failed: network error.");
    } finally {
      setSyncing(false);
    }
  }

  async function processVideo(v: VideoRow) {
    setBusy(v.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/youtube/videos/${v.id}/process`, {
        method: "POST",
      });
      const data = await res.json();
      setMessage(
        data.ok
          ? `"${v.title.slice(0, 50)}" processed (${data.segments} segments).`
          : `"${v.title.slice(0, 50)}": ${data.status ?? "Failed"} — ${data.message ?? data.error}`,
      );
      router.refresh();
    } catch {
      setMessage("Processing failed: network error.");
    } finally {
      setBusy(null);
    }
  }

  async function viewTranscript(v: VideoRow) {
    const res = await fetch(`/api/youtube/videos/${v.id}/transcript`);
    const data = await res.json();
    if (data.ok && data.video.transcript) {
      setViewing({
        title: v.title,
        content: data.video.transcript.content,
        origin: data.video.transcript.origin,
        language: data.video.transcript.language,
      });
    } else {
      setMessage("No stored transcript for this video yet.");
    }
  }

  async function submitImport() {
    if (!importing) return;
    setBusy(importing.id);
    try {
      const res = await fetch(`/api/youtube/videos/${importing.id}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: importText, language: "hi" }),
      });
      const data = await res.json();
      setMessage(data.ok ? "Transcript imported." : `Import failed: ${data.error}`);
      if (data.ok) {
        setImporting(null);
        setImportText("");
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={syncAll}
          disabled={syncing}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : playlists.length === 0 ? "Fetch playlist inventory" : "Re-sync playlists"}
        </button>
        <span className="text-sm text-zinc-500">
          {playlists.length}/{requiredCount} playlists inventoried
        </span>
      </div>

      {message && (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {message}
        </p>
      )}

      {playlists.map((p) => (
        <section key={p.id} className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-medium text-zinc-900">
              <a href={p.url} target="_blank" className="hover:underline">
                {p.title}
              </a>
            </h2>
            <span className="text-xs text-zinc-500">
              {p.videoCount} videos
              {p.lastSynced &&
                ` · synced ${new Date(p.lastSynced).toLocaleString()}`}
            </span>
          </div>
          {/* Phone: card list */}
          <ul className="mt-2 space-y-2 md:hidden">
            {p.videos.map((v, i) => (
              <li key={v.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 w-5 shrink-0 text-xs text-zinc-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <a href={v.url} target="_blank" className="block text-zinc-800 hover:underline">
                      {v.title}
                    </a>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLES[v.status] ?? "bg-zinc-100"}`}>
                        {busy === v.id ? "Working…" : v.status}
                      </span>
                      <span>{fmtDuration(v.durationSec)}</span>
                    </div>
                    {v.statusNote && (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-400" title={v.statusNote}>
                        {v.statusNote}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {v.status !== "Completed" && (
                    <button
                      onClick={() => processVideo(v)}
                      disabled={busy !== null}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 disabled:opacity-40"
                    >
                      {v.status === "Failed" || v.status === "TranscriptUnavailable" ? "Retry" : "Process"}
                    </button>
                  )}
                  {v.status === "Completed" && (
                    <button onClick={() => viewTranscript(v)} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                      Transcript
                    </button>
                  )}
                  <button onClick={() => setImporting(v)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-500 hover:bg-zinc-50">
                    Import
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {/* Tablet/desktop: table */}
          <div className="mt-2 hidden overflow-x-auto rounded-lg border border-zinc-200 md:block">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Video</th>
                  <th className="px-3 py-2">Length</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {p.videos.map((v, i) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <a href={v.url} target="_blank" className="text-zinc-800 hover:underline">
                        {v.title}
                      </a>
                      {v.statusNote && (
                        <p className="mt-0.5 text-xs text-zinc-400" title={v.statusNote}>
                          {v.statusNote.slice(0, 120)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{fmtDuration(v.durationSec)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[v.status] ?? "bg-zinc-100"}`}
                      >
                        {busy === v.id ? "Working…" : v.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 text-xs">
                        {v.status !== "Completed" && (
                          <button
                            onClick={() => processVideo(v)}
                            disabled={busy !== null}
                            className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50 disabled:opacity-40"
                          >
                            {v.status === "Failed" || v.status === "TranscriptUnavailable"
                              ? "Retry"
                              : "Process"}
                          </button>
                        )}
                        {v.status === "Completed" && (
                          <button
                            onClick={() => viewTranscript(v)}
                            className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-50"
                          >
                            Transcript
                          </button>
                        )}
                        <button
                          onClick={() => setImporting(v)}
                          className="rounded border border-zinc-300 px-2 py-1 text-zinc-500 hover:bg-zinc-50"
                        >
                          Import
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {playlists.length === 0 && (
        <p className="mt-8 text-sm text-zinc-500">
          No playlists inventoried yet. Click “Fetch playlist inventory” to load
          the three GTF playlists.
        </p>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setViewing(null)}>
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-zinc-900">{viewing.title}</h3>
                <p className="text-xs text-zinc-500">
                  {viewing.origin === "auto" ? "Auto caption track" : "Manual import"} · language: {viewing.language}
                </p>
              </div>
              <button onClick={() => setViewing(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{viewing.content}</pre>
          </div>
        </div>
      )}

      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setImporting(null)}>
          <div
            className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-medium text-zinc-900">Import authorized transcript</h3>
            <p className="mt-1 text-xs text-zinc-500">
              For: {importing.title}. Paste a transcript you are authorized to
              use (e.g. copied from YouTube’s own transcript panel). Optional
              [mm:ss] prefixes per line are preserved as timestamps.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              className="mt-3 w-full rounded-md border border-zinc-300 p-2 text-sm"
              placeholder="[00:00] Transcript text…"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setImporting(null)} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
                Cancel
              </button>
              <button
                onClick={submitImport}
                disabled={busy !== null || importText.trim().length < 50}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
