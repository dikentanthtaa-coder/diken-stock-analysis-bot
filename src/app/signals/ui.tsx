"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SignalChart, type PriceLine } from "./chart";
import { INTERVALS, INTERVAL_SPEC, isInterval, type Bar, type Interval } from "@/server/market/intervals";
import type { SignalReport, TimeframeScore, Factor } from "@/server/signal/engine";
import type { IntradayFreshness } from "@/server/market/intraday";
import type { QuoteMeta } from "@/server/market/provider";
import type { MarketRegime } from "@/server/market/regime-calc";
import type { GateResult } from "@/server/discipline/gate";
import type { LiveRecord } from "@/server/signal/postmortem";

interface SymbolHit {
  symbol: string;
  exchange: "NSE" | "BSE";
  name: string;
}

interface SignalResponse {
  ok: boolean;
  error?: string;
  kind?: string;
  stock?: { symbol: string; exchange: "NSE" | "BSE"; name: string };
  interval?: Interval;
  bars?: Bar[];
  quote?: QuoteMeta;
  freshness?: IntradayFreshness;
  timeframeStatus?: Record<string, { status: string; bars: number; lastBarTime: number | null }>;
  warnings?: string[];
  report?: SignalReport;
  regime?: MarketRegime | null;
  signalEventId?: string | null;
  aiAvailable?: boolean;
  serverTime?: string;
}

const POSTURE_STYLE: Record<string, string> = {
  "confirmed-uptrend": "bg-emerald-100 text-emerald-800",
  "under-pressure": "bg-amber-100 text-amber-800",
  "rally-attempt": "bg-sky-100 text-sky-800",
  correction: "bg-red-100 text-red-800",
};
const TONE: Record<string, string> = { good: "text-emerald-700", warn: "text-amber-700", bad: "text-red-700", neutral: "text-zinc-600" };
const CHECK_STYLE: Record<string, string> = { pass: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-800", fail: "bg-red-100 text-red-800", skip: "bg-zinc-100 text-zinc-500" };

const IST = "Asia/Kolkata";
const tFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dtFmt = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const inr = (v: number | null | undefined, d = 2) =>
  v == null ? "—" : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));

const SIGNAL_STYLE: Record<string, { card: string; pill: string; bar: string }> = {
  BUY: { card: "border-emerald-200 bg-emerald-50/60", pill: "bg-emerald-600 text-white", bar: "bg-emerald-500" },
  SELL: { card: "border-red-200 bg-red-50/60", pill: "bg-red-600 text-white", bar: "bg-red-500" },
  HOLD: { card: "border-zinc-200 bg-zinc-50", pill: "bg-zinc-700 text-white", bar: "bg-zinc-400" },
};

const STATUS_STYLE: Record<string, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  delayed: "border-amber-200 bg-amber-50 text-amber-800",
  closed: "border-zinc-200 bg-zinc-100 text-zinc-700",
  stale: "border-red-200 bg-red-50 text-red-700",
  unavailable: "border-red-200 bg-red-50 text-red-700",
};

export function SignalsClient() {
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SymbolHit | null>(null);
  const [interval, setInterval_] = useState<Interval>("5m");
  const [data, setData] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [gate, setGate] = useState<{ result: GateResult; quantity: number; sizingNote: string | null; settings: { capital: number; maxRiskPct: number } } | null>(null);
  const [record, setRecord] = useState<LiveRecord | null>(null);
  const [ai, setAi] = useState<{ busy: boolean; text: string | null; error: string | null }>({ busy: false, text: null, error: null });
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const autoRan = useRef(false);

  const load = useCallback(async (sel: SymbolHit, iv: Interval, log: boolean) => {
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const params = new URLSearchParams({ symbol: sel.symbol, exchange: sel.exchange, interval: iv, log: log ? "1" : "0", name: sel.name });
      const res = await fetch(`/api/signal?${params}`, { signal: ctl.signal, cache: "no-store" });
      const d = (await res.json()) as SignalResponse;
      if (ctl.signal.aborted) return;
      if (!d.ok) {
        setError(d.error ?? "Signal request failed.");
        if (d.kind === "not_found") setData(null);
      } else {
        setError(null);
        setData(d);
        setReceivedAt(Date.now());
        setAi((a) => ({ ...a, text: null, error: null }));
        const plan = d.report?.plan;
        const primaryTf = d.report?.timeframes.find((t) => t.interval === iv);
        if (plan && d.report) {
          void fetch("/api/discipline/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              direction: plan.direction, entry: plan.entry, stop: plan.stop, target1: plan.target1,
              signal: d.report.signal, signalConfidence: d.report.confidence,
              dailyTrend: d.report.timeframes.find((t) => t.interval === "1d")?.trend ?? null,
              dataStatus: d.freshness?.status ?? null, atr: primaryTf?.indicators.atr14 ?? null,
              thesis: null,
            }),
          }).then((r) => r.json()).then((g) => { if (g.ok) setGate(g); }).catch(() => {});
        } else {
          setGate(null);
        }
        if (log) {
          void fetch(`/api/signal/record?symbol=${encodeURIComponent(sel.symbol)}&exchange=${sel.exchange}&interval=${iv}&take=8`)
            .then((r) => r.json()).then((rec) => { if (rec.ok) setRecord(rec); }).catch(() => {});
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError("Network error while fetching market data.");
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, []);

  // Deep link: /signals?symbol=INFY&exchange=NSE&interval=15m
  useEffect(() => {
    if (autoRan.current) return;
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const exchange = searchParams.get("exchange");
    const iv = searchParams.get("interval");
    if (!symbol || (exchange !== "NSE" && exchange !== "BSE")) return;
    const sel = { symbol, exchange, name: symbol } as SymbolHit;
    const t = setTimeout(() => {
      if (autoRan.current) return;
      autoRan.current = true;
      setSelected(sel);
      setQ(`${symbol} (${exchange})`);
      if (isInterval(iv)) setInterval_(iv);
      void load(sel, isInterval(iv) ? iv : "5m", true);
    }, 0);
    return () => clearTimeout(t);
  }, [searchParams, load]);

  // Symbol search (debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2 || (selected && q === `${selected.symbol} (${selected.exchange})`)) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(q)}`);
        const d = await res.json();
        setHits(d.ok ? d.results : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, selected]);

  // Auto-refresh paced by interval and market state; paused when hidden.
  const marketState = data?.freshness?.marketState;
  const pollDelay = marketState === "open" ? INTERVAL_SPEC[interval].pollMs : Math.max(INTERVAL_SPEC[interval].pollMs, 5 * 60_000);
  const nextAt = auto && selected && data?.ok && receivedAt != null ? receivedAt + pollDelay : null;
  useEffect(() => {
    if (nextAt == null || !selected) return;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") void load(selected, interval, false);
    }, Math.max(0, nextAt - Date.now()));
    return () => clearTimeout(t);
  }, [nextAt, selected, interval, load]);

  // Resume when the tab becomes visible again.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && auto && selected) void load(selected, interval, false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [auto, selected, interval, load]);

  // Clock for the countdown.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  function pick(h: SymbolHit) {
    setHits([]);
    setQ(`${h.symbol} (${h.exchange})`);
    setSelected(h);
    setData(null);
    setError(null);
    window.history.replaceState(null, "", `/signals?symbol=${encodeURIComponent(h.symbol)}&exchange=${h.exchange}&interval=${interval}`);
    void load(h, interval, true);
  }
  function changeInterval(iv: Interval) {
    setInterval_(iv);
    if (selected) {
      window.history.replaceState(null, "", `/signals?symbol=${encodeURIComponent(selected.symbol)}&exchange=${selected.exchange}&interval=${iv}`);
      void load(selected, iv, false);
      void fetch(`/api/signal/record?symbol=${encodeURIComponent(selected.symbol)}&exchange=${selected.exchange}&interval=${iv}&take=8`)
        .then((r) => r.json()).then((rec) => { if (rec.ok) setRecord(rec); }).catch(() => {});
    }
  }

  async function explain() {
    if (!data?.ok || !data.report || !data.stock) return;
    setAi({ busy: true, text: null, error: null });
    try {
      const res = await fetch("/api/signal/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: data.stock.symbol, exchange: data.stock.exchange, name: data.stock.name, interval,
          lastPrice: data.quote?.lastPrice ?? null, freshnessNote: data.freshness?.note ?? "", source: data.freshness?.source ?? "",
          report: data.report,
        }),
      });
      const d = await res.json();
      setAi({ busy: false, text: d.ok ? d.text : null, error: d.ok ? null : d.error });
    } catch {
      setAi({ busy: false, text: null, error: "Network error." });
    }
  }

  const report = data?.report;
  const primaryTf = report?.timeframes.find((t) => t.interval === interval) ?? null;
  const priceLines = useMemo<PriceLine[]>(() => {
    if (!report) return [];
    const out: PriceLine[] = [];
    if (report.plan) {
      out.push({ price: report.plan.entry, title: "Entry", color: "#4f46e5" });
      out.push({ price: report.plan.stop, title: "Stop", color: "#dc2626" });
      out.push({ price: report.plan.target1, title: "T1", color: "#059669" });
      out.push({ price: report.plan.target2, title: "T2", color: "#059669", dashed: true });
    } else {
      if (report.levelsToWatch.support != null) out.push({ price: report.levelsToWatch.support, title: "Support", color: "#059669", dashed: true });
      if (report.levelsToWatch.resistance != null) out.push({ price: report.levelsToWatch.resistance, title: "Resistance", color: "#dc2626", dashed: true });
    }
    return out;
  }, [report]);
  const chartPatterns = useMemo(() => {
    if (!primaryTf || !data?.bars) return [];
    // Pattern indices refer to the full server-side series; the client gets
    // the tail, so shift them.
    const offset = (primaryTf.barsUsed + (data.freshness?.lastBarForming ? 1 : 0)) - data.bars.length;
    return primaryTf.patterns.map((p) => ({ ...p, index: p.index - offset }));
  }, [primaryTf, data]);

  const quote = data?.quote;
  const change = quote?.lastPrice != null && quote.previousClose != null ? quote.lastPrice - quote.previousClose : null;
  const changePct = change != null && quote?.previousClose ? (change / quote.previousClose) * 100 : null;
  const style = report ? SIGNAL_STYLE[report.signal] : SIGNAL_STYLE.HOLD;
  const secsToNext = nextAt ? Math.max(0, Math.round((nextAt - now) / 1000)) : null;

  return (
    <div className="mt-6">
      {/* Search + interval controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="relative flex-1 lg:max-w-xl">
          <svg className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Stock name or ticker (e.g. Reliance, TATAMOTORS)…"
            className="w-full rounded-xl border border-zinc-300 bg-white py-3 pl-11 pr-4 text-base shadow-sm"
            aria-label="Search stock"
          />
          {searching && <span className="absolute right-3 top-3 text-xs text-zinc-400">…</span>}
          {hits.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl">
              {hits.map((h) => (
                <li key={`${h.symbol}-${h.exchange}`}>
                  <button onClick={() => pick(h)} className="flex w-full items-baseline justify-between px-3 py-2.5 text-left text-sm hover:bg-zinc-50">
                    <span><span className="font-medium">{h.symbol}</span><span className="ml-2 text-zinc-500">{h.name.slice(0, 48)}</span></span>
                    <span className="text-xs text-zinc-400">{h.exchange}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Timeframe" className="flex rounded-xl border border-zinc-300 bg-white p-1 shadow-sm">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                role="tab"
                aria-selected={iv === interval}
                onClick={() => changeInterval(iv)}
                className={`min-w-[2.75rem] rounded-lg px-2.5 py-2 text-xs font-medium sm:text-sm ${iv === interval ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
              >
                {iv.toUpperCase()}
              </button>
            ))}
          </div>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-600 shadow-sm sm:text-sm">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            Auto-refresh
          </label>
          {selected && (
            <button onClick={() => load(selected, interval, false)} disabled={loading} className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 sm:text-sm">
              {loading ? "Refreshing…" : "Refresh now"}
            </button>
          )}
        </div>
      </div>

      {!selected && !data && (
        <div className="mt-8 rounded-lg border border-zinc-200 p-6 text-sm text-zinc-600">
          <p className="font-medium text-zinc-900">How it works</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Pick a stock, then a timeframe. The engine scores that chart plus two higher timeframes and the daily chart.</li>
            <li>Each timeframe is scored from trend (EMA 20/50/200, market structure), momentum (RSI, MACD), Bollinger position, VWAP, volume, candlestick patterns and support/resistance.</li>
            <li>BUY or SELL appears only when the weighted vote is strong, timeframes agree, and the daily trend does not oppose it. Otherwise it is HOLD with the reasons listed.</li>
            <li>Data status is always shown: live, delayed, market closed or stale. Nothing is ever simulated.</li>
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>
      )}
      {loading && !data && <p className="mt-6 text-sm text-zinc-500">Fetching {selected?.symbol} across timeframes…</p>}

      {data?.ok && report && data.stock && data.freshness && (
        <div className="mt-6 space-y-4">
          {/* Header: name, price, freshness */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-zinc-900">
                {data.stock.name} <span className="text-zinc-400">{data.stock.symbol} · {data.stock.exchange}</span>
              </h2>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-semibold tabular-nums text-zinc-900">{inr(quote?.lastPrice ?? data.bars?.at(-1)?.close)}</span>
                {change != null && (
                  <span className={`text-sm font-medium tabular-nums ${change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)} ({changePct?.toFixed(2)}%)
                  </span>
                )}
                <span className="text-xs text-zinc-500">vs prev close {inr(quote?.previousClose)}</span>
              </div>
            </div>
            <div className="text-xs text-zinc-500 sm:text-right">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${STATUS_STYLE[data.freshness.status]}`}>
                {data.freshness.status === "live" && <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                {data.freshness.status.toUpperCase()}
                {data.freshness.observedLagSec != null && data.freshness.status === "live" && ` · ${data.freshness.observedLagSec}s lag`}
                {data.freshness.declaredDelayMin != null && data.freshness.declaredDelayMin > 0 && ` · ${data.freshness.declaredDelayMin} min delay`}
              </span>
              <p className="mt-1.5">{data.freshness.note}</p>
              <p className="mt-0.5">
                Source {data.freshness.source}{data.freshness.servedFromCache ? " (cached)" : ""} · fetched {tFmt.format(new Date(data.freshness.fetchedAt))} IST
                {data.freshness.lastBarTime != null && ` · last ${interval} bar ${dtFmt.format(new Date(data.freshness.lastBarTime * 1000))}${data.freshness.lastBarForming ? " (forming)" : ""}`}
              </p>
              {auto && secsToNext != null && <p className="mt-0.5">Next refresh in {secsToNext}s{marketState !== "open" ? " (market closed: slow polling)" : ""}</p>}
            </div>
          </div>

          {/* Signal + plan */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`rounded-lg border p-4 lg:col-span-1 ${style.card}`}>
              <div className="flex items-center justify-between">
                <span className="flex flex-col items-start gap-1">
                  <span className={`rounded-lg px-4 py-2 text-2xl font-bold tracking-wide ${style.pill}`}>{report.signal}</span>
                  {report.vetoed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{report.vetoed.signal} vetoed by {report.vetoed.reason}</span>}
                </span>
                <span className="text-right text-xs text-zinc-500">
                  {interval.toUpperCase()} primary<br />score {report.combinedScore > 0 ? "+" : ""}{report.combinedScore} · agreement {(report.agreement * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-zinc-800">Confidence</span>
                  <span className="tabular-nums text-zinc-700">{report.confidence}/100 · {report.confidenceLabel}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-200" role="meter" aria-valuenow={report.confidence} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
                  <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${report.confidence}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
                  Confidence = how strongly indicators and timeframes agree. It is not a probability of profit.
                </p>
              </div>
              {report.cautions.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-zinc-700">
                  {report.cautions.slice(0, 5).map((c, i) => <li key={i}>⚠ {c}</li>)}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 p-4 lg:col-span-2">
              {report.plan ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-medium text-zinc-900">Trade plan ({report.plan.direction}) · {report.plan.basisInterval.toUpperCase()}</h3>
                    <span className="text-xs text-zinc-500">ATR14 {num(report.plan.atr)} · risk/share {inr(report.plan.riskPerShare)}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Stat label="Entry" value={inr(report.plan.entry)} tone="indigo" />
                    <Stat label="Stop-loss" value={inr(report.plan.stop)} tone="red" />
                    <Stat label="Target 1" value={inr(report.plan.target1)} sub={`R:R ${report.plan.rewardRiskT1}`} tone="emerald" />
                    <Stat label="Target 2" value={inr(report.plan.target2)} sub={`R:R ${report.plan.rewardRiskT2}`} tone="emerald" />
                  </dl>
                  <ul className="mt-3 space-y-1 text-xs text-zinc-600">
                    <li><b>Entry:</b> {report.plan.entryNote}</li>
                    <li><b>Stop:</b> {report.plan.stopNote}</li>
                    <li><b>Targets:</b> {report.plan.targetNote}</li>
                  </ul>
                  <p className="mt-3 text-xs text-zinc-500">
                    Size it in the <Link href={`/planner?entry=${report.plan.entry}&stop=${report.plan.stop}&target1=${report.plan.target1}&target2=${report.plan.target2}`} className="underline">Trade Planner</Link>. Levels are derived from ATR and swing structure on this timeframe; re-check before acting.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-medium text-zinc-900">No trade plan — levels to watch</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <Stat label="Nearest support" value={inr(report.levelsToWatch.support)} tone="emerald" />
                    <Stat label="Nearest resistance" value={inr(report.levelsToWatch.resistance)} tone="red" />
                  </dl>
                  <p className="mt-3 text-xs text-zinc-600">
                    A decisive close beyond one of these levels, with volume above average and the higher timeframes agreeing, is what turns HOLD into a signal.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Market regime · trend template · pre-trade gate */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-zinc-900">Market regime (NIFTY)</h3>
                {data.regime && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${POSTURE_STYLE[data.regime.posture]}`}>{data.regime.posture.replace("-", " ")}</span>}
              </div>
              {data.regime ? (
                <>
                  <p className="mt-2 text-xs text-zinc-700">{data.regime.headline}</p>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {data.regime.checks.map((c) => (
                      <li key={c.id} className="flex justify-between gap-2"><span className="text-zinc-500">{c.label}</span><span className={`text-right ${TONE[c.tone]}`}>{c.value}</span></li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-zinc-400">NIFTY 50 {data.regime.nifty.close.toFixed(0)} · as of {dtFmt.format(new Date(data.regime.asOfBarTime * 1000))} · {data.regime.status}</p>
                </>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Index data unavailable — no market-wide veto applied.</p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-zinc-900">Daily trend template</h3>
                {report.trendTemplate && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${report.trendTemplate.verdict === "stage2" ? "bg-emerald-100 text-emerald-800" : report.trendTemplate.verdict === "near" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600"}`}>
                    {report.trendTemplate.passed}/{report.trendTemplate.total} · {report.trendTemplate.verdict === "stage2" ? "Stage 2" : report.trendTemplate.verdict === "near" ? "near Stage 2" : "not Stage 2"}
                  </span>
                )}
              </div>
              {report.trendTemplate ? (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {report.trendTemplate.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-2">
                      <span className={c.pass ? "text-emerald-600" : "text-zinc-400"}>{c.pass ? "✓" : "✗"}</span>
                      <span className="text-zinc-700" title={c.detail}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Needs 200 daily bars.</p>
              )}
              <p className="mt-2 text-[11px] text-zinc-400">Minervini&apos;s 8-point stage-analysis checklist on daily closes (RS is a self-relative proxy).</p>
            </div>

            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-zinc-900">Pre-trade gate</h3>
                {gate && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${gate.result.verdict === "go" ? "bg-emerald-100 text-emerald-800" : gate.result.verdict === "caution" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{gate.result.verdict}</span>}
              </div>
              {report.plan && gate ? (
                <>
                  <p className="mt-2 text-xs text-zinc-600">Sized for {gate.settings.maxRiskPct}% risk on {inr(gate.settings.capital, 0)}: <b>{gate.quantity} shares</b> ({inr(gate.result.positionValue, 0)}, risk {inr(gate.result.riskAmount, 0)}).{gate.sizingNote ? ` ${gate.sizingNote}` : ""}</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {gate.result.checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${CHECK_STYLE[c.status]}`}>{c.status}</span>
                        <span className="text-zinc-700" title={c.detail}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/paper?symbol=${encodeURIComponent(data.stock.symbol)}&exchange=${data.stock.exchange}&entry=${report.plan.entry}&stop=${report.plan.stop}&target1=${report.plan.target1}&qty=${gate.quantity}&signal=${report.signal}&interval=${interval}&atr=${report.plan.atr}&status=${data.freshness.status}`} className="mt-3 inline-block rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                    Record as paper trade →
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">The checklist (risk ≤ limit, R:R, circuit breaker, exposure ceiling, position count, engine alignment, data freshness, thesis) runs once there is a trade plan. Rules are editable in Settings.</p>
              )}
            </div>
          </div>

          {/* Live record + AI narrative */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium text-zinc-900">Live record of this engine</h3>
              {record ? (
                <>
                  <p className="mt-2 text-xs text-zinc-600">
                    {data.stock.symbol} {interval.toUpperCase()}: {record.totals.total} signal{record.totals.total === 1 ? "" : "s"} recorded, {record.totals.evaluated} graded
                    {record.totals.hitRate != null && <> · target-1-before-stop <b>{(record.totals.hitRate * 100).toFixed(0)}%</b></>}
                    {record.totals.avgResultR != null && <> · avg <b>{record.totals.avgResultR > 0 ? "+" : ""}{record.totals.avgResultR}R</b></>}
                  </p>
                  {record.recent.length > 0 ? (
                    <ul className="mt-2 divide-y divide-zinc-100 text-xs">
                      {record.recent.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1">
                          <span><b className={e.signal === "BUY" ? "text-emerald-700" : "text-red-700"}>{e.signal}</b> {dtFmt.format(new Date(e.barTime))} @ {e.entry.toFixed(2)} · conf {e.confidence}</span>
                          <span className={e.outcome === "target1" ? "text-emerald-700" : e.outcome === "stop" ? "text-red-700" : "text-zinc-500"}>
                            {e.outcome}{e.resultR != null ? ` (${e.resultR > 0 ? "+" : ""}${e.resultR}R)` : ""}{e.outcome === "pending" ? ` · ${e.barsChecked}/${record.maxBars} bars` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-500">No BUY/SELL has been emitted for this symbol and timeframe yet. Every one that appears is recorded and graded against what happens next, so the record is forward-tested, not back-fitted.</p>
                  )}
                  <p className="mt-2 text-[11px] text-zinc-400">Graded on closed bars only: stop before target within a bar; expired after {record.maxBars} bars at the open R. <Link href="/journal#signal-record" className="underline">Full record</Link>.</p>
                </>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Loading record…</p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-zinc-900">AI narrative</h3>
                {data.aiAvailable ? (
                  <button onClick={explain} disabled={ai.busy} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                    {ai.busy ? "Writing…" : ai.text ? "Regenerate" : "Explain with AI"}
                  </button>
                ) : (
                  <span className="text-[11px] text-zinc-400">not configured</span>
                )}
              </div>
              {ai.error && <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{ai.error}</p>}
              {ai.text ? (
                <div className="mt-2 whitespace-pre-line text-xs leading-relaxed text-zinc-700">{ai.text}</div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
                  {data.aiAvailable
                    ? "Restates the engine's own numbers as a short verdict / for / against / what-would-change / caveats note. It never alters the signal."
                    : "Set AI_PROVIDER=claude and AI_API_KEY in .env to get a prose explanation built from the engine's numbers (Claude Academy prompting guidance: named metrics, explicit criteria, stated freshness, fixed format)."}
                </p>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-lg border border-zinc-200 p-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-1 text-[11px] text-zinc-500">
              <Legend color="#4f46e5" label="EMA20" /><Legend color="#d97706" label="EMA50" /><Legend color="#a1a1aa" label="Bollinger 20/2" dashed /><Legend color="#0284c7" label={interval === "1d" ? "VWAP 20" : "Session VWAP"} dotted />
              <span className="ml-auto">▲▼ pattern markers · {data.bars?.length} bars loaded</span>
            </div>
            <SignalChart bars={data.bars ?? []} interval={interval} patterns={chartPatterns} priceLines={priceLines} />
          </div>

          {/* Multi-timeframe table */}
          <div className="overflow-x-auto rounded-lg border border-zinc-200">
            <table className="rtable w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Timeframe</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Bias</th><th className="px-3 py-2">Structure</th>
                  <th className="px-3 py-2">RSI14</th><th className="px-3 py-2">MACD hist</th><th className="px-3 py-2">%B</th><th className="px-3 py-2">Vol ×avg</th><th className="px-3 py-2">Weight</th><th className="px-3 py-2">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report.timeframes.map((t) => <TfRow key={t.interval} t={t} weight={report.weights[t.interval] ?? 0} status={data.timeframeStatus?.[t.interval]} primary={t.interval === interval} />)}
              </tbody>
            </table>
          </div>

          {/* Why + factors + patterns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium text-zinc-900">Why {report.signal}?</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-700">
                {report.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium text-zinc-900">{interval.toUpperCase()} indicator breakdown</h3>
              {primaryTf && !primaryTf.insufficient ? (
                <>
                  <ul className="mt-2 space-y-1.5">
                    {primaryTf.factors.map((f, i) => <FactorRow key={i} f={f} />)}
                  </ul>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 sm:grid-cols-3">
                    <span>EMA20 {num(primaryTf.indicators.ema20)}</span><span>EMA50 {num(primaryTf.indicators.ema50)}</span><span>EMA200 {num(primaryTf.indicators.ema200)}</span>
                    <span>RSI14 {num(primaryTf.indicators.rsi14, 1)}</span><span>MACD {num(primaryTf.indicators.macd, 3)} / sig {num(primaryTf.indicators.macdSignal, 3)}</span><span>ATR14 {num(primaryTf.indicators.atr14)}</span>
                    <span>BB {num(primaryTf.indicators.bbLower)}–{num(primaryTf.indicators.bbUpper)}</span><span>VWAP {num(primaryTf.indicators.vwap)}</span><span>Vol {primaryTf.indicators.volumeRatio != null ? `${primaryTf.indicators.volumeRatio.toFixed(2)}×` : "—"}</span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">{primaryTf?.cautions.join(" ") ?? "No data."}</p>
              )}
            </div>
          </div>

          {primaryTf && primaryTf.patterns.length > 0 && (
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium text-zinc-900">Candlestick patterns (last 3 closed {interval.toUpperCase()} bars)</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {primaryTf.patterns.map((p, i) => (
                  <li key={i} className="rounded-md border border-zinc-200 px-3 py-2 text-xs">
                    <span className={`font-medium ${p.direction === "bullish" ? "text-emerald-700" : p.direction === "bearish" ? "text-red-700" : "text-zinc-700"}`}>{p.name}</span>
                    <span className="ml-2 text-zinc-400">{p.direction} · strength {p.strength}/3 · {p.index === primaryTf.index ? "last closed bar" : `${primaryTf.index - p.index} bar(s) ago`}</span>
                    <p className="mt-0.5 text-zinc-600">{p.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {primaryTf && primaryTf.levels.length > 0 && (
            <div className="rounded-lg border border-zinc-200 p-4 text-sm">
              <h3 className="font-medium text-zinc-900">Support / resistance ({interval.toUpperCase()} swing clusters)</h3>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                {primaryTf.levels.slice(0, 8).map((l, i) => (
                  <li key={i} className={`rounded-full border px-2.5 py-1 ${l.kind === "support" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                    {l.kind} {inr(l.price)} · {l.touches} touches
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <Link href={`/backtest?strategy=signal&symbol=${encodeURIComponent(data.stock.symbol)}&exchange=${data.stock.exchange}&interval=${interval}`} className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50">
              Backtest this engine on {data.stock.symbol} {interval.toUpperCase()}
            </Link>
            <Link href={`/research?symbol=${encodeURIComponent(data.stock.symbol)}&exchange=${data.stock.exchange}`} className="rounded-md border border-zinc-300 bg-white px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50">
              Swing research (EOD)
            </Link>
          </div>

          <div className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-500">
            {(data.warnings ?? []).map((w, i) => <p key={i}>⚠ {w}</p>)}
            <p className="mt-1">· {report.disclaimer}</p>
            <p>· Market hours 09:15–15:30 IST, Mon–Fri. Exchange holidays are not known to the app; a weekday with no fresh trades shows as delayed.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "indigo" | "red" | "emerald" }) {
  const t = { indigo: "text-indigo-700", red: "text-red-700", emerald: "text-emerald-700" }[tone];
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums ${t}`}>{value}</dd>
      {sub && <dd className="text-[11px] text-zinc-500">{sub}</dd>}
    </div>
  );
}

function Legend({ color, label, dashed, dotted }: { color: string; label: string; dashed?: boolean; dotted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-0 w-5 border-t-2" style={{ borderColor: color, borderStyle: dashed ? "dashed" : dotted ? "dotted" : "solid" }} />
      {label}
    </span>
  );
}

function FactorRow({ f }: { f: Factor }) {
  const tone = f.score > 0 ? "bg-emerald-100 text-emerald-800" : f.score < 0 ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-600";
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className={`mt-0.5 w-10 shrink-0 rounded px-1.5 py-0.5 text-center font-medium tabular-nums ${tone}`}>{f.score > 0 ? "+" : ""}{Math.round(f.score)}</span>
      <span className="text-zinc-700"><b className="text-zinc-900">{f.label}:</b> {f.detail}</span>
    </li>
  );
}

function TfRow({ t, weight, status, primary }: { t: TimeframeScore; weight: number; status?: { status: string; bars: number }; primary: boolean }) {
  const biasTone = t.bias === "bullish" ? "text-emerald-700" : t.bias === "bearish" ? "text-red-700" : "text-zinc-600";
  return (
    <tr className={primary ? "bg-indigo-50/40" : ""}>
      <td data-label="Timeframe" data-primary="" className="px-3 py-2 font-medium">{t.interval.toUpperCase()}{primary && <span className="ml-1 text-[10px] text-indigo-600">primary</span>}</td>
      <td data-label="Score" className={`px-3 py-2 tabular-nums font-medium ${biasTone}`}>{t.insufficient ? "—" : `${t.score > 0 ? "+" : ""}${t.score}`}</td>
      <td data-label="Bias" className={`px-3 py-2 capitalize ${biasTone}`}>{t.insufficient ? "insufficient" : t.bias}</td>
      <td data-label="Structure" className="px-3 py-2 capitalize text-zinc-700">{t.insufficient ? "—" : t.trend}</td>
      <td data-label="RSI14" className="px-3 py-2 tabular-nums">{num(t.indicators.rsi14, 1)}</td>
      <td data-label="MACD hist" className={`px-3 py-2 tabular-nums ${t.indicators.macdHist != null ? (t.indicators.macdHist > 0 ? "text-emerald-700" : "text-red-700") : ""}`}>{num(t.indicators.macdHist, 3)}</td>
      <td data-label="%B" className="px-3 py-2 tabular-nums">{num(t.indicators.percentB)}</td>
      <td data-label="Vol ×avg" className="px-3 py-2 tabular-nums">{t.indicators.volumeRatio != null ? `${t.indicators.volumeRatio.toFixed(2)}×` : "—"}</td>
      <td data-label="Weight" className="px-3 py-2 tabular-nums text-zinc-500">{(weight * 100).toFixed(0)}%</td>
      <td data-label="Data" className="px-3 py-2 text-xs text-zinc-500">{status ? `${status.status} · ${status.bars} bars` : t.barsUsed ? `${t.barsUsed} bars` : "—"}</td>
    </tr>
  );
}
