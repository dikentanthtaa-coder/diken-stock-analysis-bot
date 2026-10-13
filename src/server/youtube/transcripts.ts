import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

const YTDLP = process.env.YTDLP_PATH || path.join(process.cwd(), "tools", "yt-dlp");

export interface TranscriptSegment {
  startSec: number;
  text: string;
}

export interface TranscriptResult {
  ok: true;
  language: string;
  segments: TranscriptSegment[];
  text: string; // "[mm:ss] line" formatted full text
}

export interface TranscriptFailure {
  ok: false;
  // "unavailable" → no caption track exists; "error" → fetch/parse problem
  kind: "unavailable" | "error";
  message: string;
}

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Json3Event {
  tStartMs?: number;
  segs?: { utf8?: string }[];
}

export function parseJson3(raw: string): TranscriptSegment[] {
  const data = JSON.parse(raw) as { events?: Json3Event[] };
  const segments: TranscriptSegment[] = [];
  for (const e of data.events ?? []) {
    if (!e.segs) continue;
    const text = e.segs.map((s) => s.utf8 ?? "").join("").replace(/\n/g, " ").trim();
    if (!text) continue;
    segments.push({ startSec: Math.round((e.tStartMs ?? 0) / 1000), text });
  }
  return segments;
}

export function segmentsToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTimestamp(s.startSec)}] ${s.text}`)
    .join("\n");
}

/**
 * Fetch a video's caption track using yt-dlp (auto or manual subs).
 * Tries original-language tracks; does not request auto-translations.
 */
export async function fetchTranscript(
  videoYoutubeId: string,
): Promise<TranscriptResult | TranscriptFailure> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(/*turbopackIgnore: true*/ path.join(tmpdir(), "dkn-subs-"));
    let execError: string | null = null;
    try {
      await execFileAsync(
        YTDLP,
        [
          "--js-runtimes",
          "node",
          "--skip-download",
          "--write-subs",
          "--write-auto-subs",
          // Original-language tracks only ("-orig"), plus plain hi/en.
          "--sub-langs",
          "hi,en,hi-orig,en-orig",
          "--sub-format",
          "json3",
          "-o",
          path.join(dir, "%(id)s.%(ext)s"),
          `https://www.youtube.com/watch?v=${videoYoutubeId}`,
        ],
        { timeout: 120_000 },
      );
    } catch (e) {
      // yt-dlp exits non-zero if ANY requested language fails (e.g. a 429
      // on one track). A usable track may still have been saved — check.
      execError = e instanceof Error ? e.message : "yt-dlp failed";
    }

    const files = (await readdir(/*turbopackIgnore: true*/ dir)).filter((f) => f.endsWith(".json3"));
    if (files.length === 0 && execError) {
      const unavailable = /no subtitles|not available/i.test(execError);
      return {
        ok: false,
        kind: unavailable ? "unavailable" : "error",
        message: execError.slice(0, 500),
      };
    }
    if (files.length === 0) {
      return {
        ok: false,
        kind: "unavailable",
        message: "No caption track available for this video.",
      };
    }
    // Prefer hi (course language), then en, then whatever came back.
    const pick =
      files.find((f) => f.includes(".hi.")) ??
      files.find((f) => f.includes(".en.")) ??
      files[0];
    const language = pick.split(".").slice(-2, -1)[0] ?? "unknown";
    const raw = await readFile(path.join(/*turbopackIgnore: true*/ dir, pick), "utf-8");
    const segments = parseJson3(raw);
    if (segments.length === 0) {
      return { ok: false, kind: "error", message: "Caption track was empty." };
    }
    return { ok: true, language, segments, text: segmentsToText(segments) };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    // yt-dlp exits non-zero with "There are no subtitles" style messages too.
    const unavailable = /no subtitles|not available/i.test(msg);
    return {
      ok: false,
      kind: unavailable ? "unavailable" : "error",
      message: msg.slice(0, 500),
    };
  } finally {
    if (dir) await rm(/*turbopackIgnore: true*/ dir, { recursive: true, force: true }).catch(() => {});
  }
}
