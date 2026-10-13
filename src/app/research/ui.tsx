"use client";

import { useEffect, useRef, useState } from "react";
import { CandleChart, type ChartCandle } from "./chart";

interface SymbolHit {
  symbol: string;
  exchange: "NSE" | "BSE";
  name: string;
  sector?: string;
}

interface Scenario {
  direction: string;
  thesis: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  confirmation: string;
  invalidation: string;
}

interface RuleMatch {
  id: string;
  title: string;
  ruleText: string;
  provenance: string;
  validation: string;
  timestamp: string | null;
  videoTitle: string | null;
  videoUrl: string | null;
  matchedSignals: string[];
}

interface Report {
  outcome: string;
  outcomeReason: string;
  asOfDate: string;
  trend: { daily: string; weekly: string; dailyEvidence: string; weeklyEvidence: string };
  levels: { price: number; touches: number; kind: string; lastTouch: string }[];
  breakout: { state: string; level: number | null; detail: string };
  volume: { ratio: number | null; detail: string };
  momentum: { rsi14: number | null; detail: string };
  volatility: { atr14: number | null; atrPct: number | null };
  movingAverages: { detail: string };
  scenarios: Scenario[];
  ruleMatches: RuleMatch[];
  dataWarnings: string[];
  limitations: string[];
}

interface AnalysisResponse {
  ok: boolean;
  error?: string;
  stock?: { symbol: string; exchange: string; name: string };
  freshness?: { source: string; lastCandleDate: string | null; note: string };
  report?: Report;
  candles?: ChartCandle[];
}

const OUTCOME_LABELS: Record<string, [string, string]> = {
  PotentialBuySetup: ["Potential Buy Setup", "bg-emerald-100 text-emerald-800"],
  WatchlistWait: ["Watchlist — Wait for Confirmation", "bg-blue-100 text-blue-800"],
  NoTrade: ["No Trade", "bg-zinc-100 text-zinc-700"],
  InsufficientData: ["Insufficient Data", "bg-amber-100 text-amber-800"],
  ReviewPosition: ["Existing Position — Review Required", "bg-purple-100 text-purple-800"],
};

const DIR_STYLE: Record<string, string> = {
  bullish: "border-emerald-200",
  bearish: "border-red-200",
  sideways: "border-zinc-200",
};

export function ResearchClient() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchMsg, setWatchMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(q)}`);
        const d = await res.json();
        setHits(d.ok ? d.results : []);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function analyze(hit: SymbolHit) {
    setHits([]);
    setQ(`${hit.symbol} (${hit.exchange})`);
    setAnalyzing(true);
    setError(null);
    setData(null);
    setWatchMsg(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: hit.symbol,
          exchange: hit.exchange,
          name: hit.name,
        }),
        signal: abortRef.current.signal,
      });
      const d = (await res.json()) as AnalysisResponse;
      if (!d.ok) setError(d.error ?? "Analysis failed.");
      else setData(d);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("Network error while analyzing.");
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function addToWatchlist() {
    if (!data?.stock) return;
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: data.stock.symbol,
        exchange: data.stock.exchange,
        name: data.stock.name,
      }),
    });
    const d = await res.json();
    setWatchMsg(d.ok ? "Added to watchlist." : "Could not add.");
  }

  const report = data?.report;
  const outcome = report ? OUTCOME_LABELS[report.outcome] : null;

  return (
    <div className="mt-6">
      <div className="relative max-w-2xl">
        <svg className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company or ticker (e.g. Infosys, TATASTEEL)…"
          className="w-full rounded-xl border border-zinc-300 bg-white py-3 pl-11 pr-4 text-base shadow-sm"
        />
        {searching && (
          <span className="absolute right-3 top-2 text-xs text-zinc-400">…</span>
        )}
        {hits.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl">
            {hits.map((h) => (
              <li key={`${h.symbol}-${h.exchange}`}>
                <button
                  onClick={() => analyze(h)}
                  className="flex w-full items-baseline justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span>
                    <span className="font-medium">{h.symbol}</span>
                    <span className="ml-2 text-zinc-500">{h.name.slice(0, 50)}</span>
                  </span>
                  <span className="text-xs text-zinc-400">{h.exchange}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {analyzing && (
        <p className="mt-6 text-sm text-zinc-500">
          Fetching data and running analysis…
        </p>
      )}
      {error && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data?.ok && report && data.stock && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-medium text-zinc-900">
              {data.stock.name}{" "}
              <span className="text-zinc-400">
                {data.stock.symbol} · {data.stock.exchange}
              </span>
            </h2>
            {outcome && (
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${outcome[1]}`}>
                {outcome[0]}
              </span>
            )}
            <button
              onClick={addToWatchlist}
              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
            >
              + Watchlist
            </button>
            {watchMsg && <span className="text-xs text-zinc-500">{watchMsg}</span>}
          </div>
          <p className="mt-1 text-sm text-zinc-600">{report.outcomeReason}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Source: {data.freshness?.source} · last candle{" "}
            {data.freshness?.lastCandleDate} · {data.freshness?.note}
          </p>

          <div className="mt-4 rounded-lg border border-zinc-200 p-2">
            <CandleChart candles={data.candles ?? []} levels={report.levels} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium">Trend</h3>
              <p className="mt-2">
                Daily: <b>{report.trend.daily}</b>
              </p>
              <p className="text-xs text-zinc-500">{report.trend.dailyEvidence}</p>
              <p className="mt-2">
                Weekly: <b>{report.trend.weekly}</b>
              </p>
              <p className="text-xs text-zinc-500">{report.trend.weeklyEvidence}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium">Momentum & Volatility</h3>
              <p className="mt-2 text-zinc-600">{report.momentum.detail}</p>
              <p className="mt-1 text-zinc-600">
                ATR14:{" "}
                {report.volatility.atr14 != null
                  ? `${report.volatility.atr14.toFixed(2)} (${report.volatility.atrPct?.toFixed(2)}% of price)`
                  : "n/a"}
              </p>
              <p className="mt-1 text-zinc-600">{report.volume.detail}</p>
              <p className="mt-1 text-xs text-zinc-500">{report.movingAverages.detail}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium">Breakout / Levels</h3>
              <p className="mt-2 text-zinc-600">{report.breakout.detail}</p>
              <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
                {report.levels.slice(0, 6).map((l, i) => (
                  <li key={i}>
                    {l.kind} ₹{l.price.toFixed(2)} · {l.touches} touches · last{" "}
                    {l.lastTouch}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h3 className="mt-6 font-medium text-zinc-900">Scenarios</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
            {report.scenarios.map((s, i) => (
              <div key={i} className={`rounded-lg border p-4 text-sm ${DIR_STYLE[s.direction]}`}>
                <p className="font-medium capitalize">
                  {s.direction}: {s.thesis}
                </p>
                {s.evidenceFor.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-medium text-zinc-500">For</p>
                    <ul className="list-disc pl-4 text-xs text-zinc-600">
                      {s.evidenceFor.map((e, j) => (
                        <li key={j}>{e}</li>
                      ))}
                    </ul>
                  </>
                )}
                {s.evidenceAgainst.length > 0 && (
                  <>
                    <p className="mt-2 text-xs font-medium text-zinc-500">Against</p>
                    <ul className="list-disc pl-4 text-xs text-zinc-600">
                      {s.evidenceAgainst.map((e, j) => (
                        <li key={j}>{e}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-2 text-xs">
                  <b>Confirm:</b> {s.confirmation}
                </p>
                <p className="mt-1 text-xs">
                  <b>Invalidate:</b> {s.invalidation}
                </p>
              </div>
            ))}
          </div>

          {report.ruleMatches.length > 0 && (
            <>
              <h3 className="mt-6 font-medium text-zinc-900">
                Knowledge-base rules matching current signals (
                {report.ruleMatches.length})
              </h3>
              <div className="mt-2 space-y-2">
                {report.ruleMatches.slice(0, 10).map((r) => (
                  <div key={r.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                    <p className="font-medium">{r.title}</p>
                    <p className="mt-1 text-xs text-zinc-600">{r.ruleText.slice(0, 300)}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Signals: {r.matchedSignals.join(", ")} ·{" "}
                      {r.provenance === "taught" ? "verbatim" : "AI"} · {r.validation}
                      {r.videoUrl && (
                        <>
                          {" · "}
                          <a href={r.videoUrl} target="_blank" className="underline">
                            {r.videoTitle?.slice(0, 40)}
                          </a>
                          {r.timestamp && ` @ ${r.timestamp}`}
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-6 rounded-md bg-zinc-50 p-3 text-xs text-zinc-500">
            {report.dataWarnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
            {report.limitations.map((l, i) => (
              <p key={i}>· {l}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
