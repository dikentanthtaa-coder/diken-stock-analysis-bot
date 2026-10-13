"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SourceVideo {
  title: string;
  url: string;
}

interface ConceptRow {
  id: string;
  name: string;
  definition: string;
  provenance: string;
  timestamp: string | null;
  tags: string | null;
  video: SourceVideo | null;
}

interface RuleRow {
  id: string;
  title: string;
  ruleText: string;
  provenance: string;
  validation: string;
  timestamp: string | null;
  notes: string | null;
  video: SourceVideo | null;
}

interface TranscriptHit {
  videoId: string;
  videoTitle: string;
  url: string;
  snippet: string;
}

const VALIDATION_STYLES: Record<string, string> = {
  unvalidated: "bg-zinc-100 text-zinc-600",
  backtested: "bg-emerald-100 text-emerald-800",
  conflicting: "bg-red-100 text-red-800",
  ambiguous: "bg-amber-100 text-amber-800",
};

export function KnowledgeClient({
  counts,
}: {
  counts: { conceptCount: number; ruleCount: number; completedVideos: number };
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"concepts" | "rules" | "transcripts">("concepts");
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setConcepts(data.concepts ?? []);
      setRules(data.rules ?? []);
      setTranscripts(data.transcripts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, search]);

  async function extract() {
    setExtracting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/knowledge/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useAi: false }),
      });
      const data = await res.json();
      if (data.ok) {
        const s = data.summary;
        setMessage(
          `Extraction done: ${s.videosScanned} transcripts scanned, ${s.conceptsUpserted} concept links, ${s.candidateRules} new candidate rules.`,
        );
      } else {
        setMessage(`Extraction failed: ${data.error}`);
      }
      search(q);
      router.refresh();
    } finally {
      setExtracting(false);
    }
  }

  async function setValidation(rule: RuleRow, validation: string) {
    await fetch(`/api/knowledge/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validation }),
    });
    search(q);
  }

  async function deleteRule(rule: RuleRow) {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/knowledge/rules/${rule.id}`, { method: "DELETE" });
    search(q);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search concepts, rules, transcripts… (English or हिन्दी)"
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          onClick={extract}
          disabled={extracting || counts.completedVideos === 0}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          title={
            counts.completedVideos === 0
              ? "Process video transcripts first (Learning page)"
              : "Scan all transcripts for concepts and rule-like excerpts"
          }
        >
          {extracting ? "Extracting…" : "Run extraction"}
        </button>
      </div>

      {message && (
        <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {message}
        </p>
      )}

      <div className="mt-6 flex gap-1 border-b border-zinc-200 text-sm">
        {(
          [
            ["concepts", `Concepts (${concepts.length})`],
            ["rules", `Strategy rules (${rules.length})`],
            ["transcripts", `Transcript hits (${transcripts.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-t-md px-4 py-2 ${
              tab === key
                ? "border border-b-0 border-zinc-200 bg-white font-medium text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="mt-4 text-sm text-zinc-400">Searching…</p>}

      {tab === "concepts" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {concepts.map((c) => (
            <div key={c.id} className="rounded-lg border border-zinc-200 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium text-zinc-900">{c.name}</h3>
                {c.tags && (
                  <span className="text-xs text-zinc-400">{c.tags}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-600">{c.definition}</p>
              {c.video && (
                <p className="mt-2 text-xs text-zinc-500">
                  Taught in:{" "}
                  <a
                    href={`${c.video.url}${c.timestamp ? `&t=${tsToSec(c.timestamp)}s` : ""}`}
                    target="_blank"
                    className="underline"
                  >
                    {c.video.title.slice(0, 60)}
                  </a>
                  {c.timestamp && ` @ ${c.timestamp}`}
                </p>
              )}
            </div>
          ))}
          {!loading && concepts.length === 0 && (
            <p className="text-sm text-zinc-500">
              No concepts yet. Run extraction after processing transcripts.
            </p>
          )}
        </div>
      )}

      {tab === "rules" && (
        <div className="mt-4 space-y-3">
          {rules.map((r) => (
            <div key={r.id} className="rounded-lg border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium text-zinc-900">{r.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${VALIDATION_STYLES[r.validation] ?? ""}`}
                >
                  {r.validation}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                  {r.provenance === "taught" ? "verbatim from source" : "AI interpretation"}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                {r.ruleText}
              </p>
              {r.notes && <p className="mt-1 text-xs text-zinc-400">{r.notes}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                {r.video && (
                  <a
                    href={`${r.video.url}${r.timestamp ? `&t=${tsToSec(r.timestamp)}s` : ""}`}
                    target="_blank"
                    className="text-zinc-500 underline"
                  >
                    Source: {r.video.title.slice(0, 50)}
                    {r.timestamp && ` @ ${r.timestamp}`}
                  </a>
                )}
                <span className="flex-1" />
                <select
                  value={r.validation}
                  onChange={(e) => setValidation(r, e.target.value)}
                  className="rounded border border-zinc-300 px-1 py-0.5"
                >
                  {["unvalidated", "backtested", "conflicting", "ambiguous"].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <button
                  onClick={() => deleteRule(r)}
                  className="text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!loading && rules.length === 0 && (
            <p className="text-sm text-zinc-500">No rules match.</p>
          )}
        </div>
      )}

      {tab === "transcripts" && (
        <div className="mt-4 space-y-3">
          {transcripts.map((t, i) => (
            <div key={i} className="rounded-lg border border-zinc-200 p-4">
              <a href={t.url} target="_blank" className="text-sm font-medium text-zinc-900 hover:underline">
                {t.videoTitle}
              </a>
              <p className="mt-1 text-sm text-zinc-600">…{t.snippet}…</p>
            </div>
          ))}
          {!loading && transcripts.length === 0 && (
            <p className="text-sm text-zinc-500">
              {q.length >= 2 ? "No transcript matches." : "Type at least 2 characters to search transcripts."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function tsToSec(ts: string): number {
  const [m, s] = ts.split(":").map(Number);
  return m * 60 + s;
}
