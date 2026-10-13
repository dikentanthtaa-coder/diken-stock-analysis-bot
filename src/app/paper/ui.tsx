"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { GateResult } from "@/server/discipline/gate";

interface Trade {
  id: string;
  status: string;
  entryPrice: number | null;
  entryDate: string | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  quantity: number | null;
  exitPrice: number | null;
  exitDate: string | null;
  exitReason: string | null;
  thesis: string | null;
  review: string | null;
  stock: { symbol: string; exchange: string; name: string };
}

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-zinc-100 text-zinc-600",
  open: "bg-blue-100 text-blue-800",
  closed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-zinc-100 text-zinc-400",
};

function pnl(t: Trade): number | null {
  if (t.status !== "closed" || t.exitPrice == null || t.entryPrice == null || t.quantity == null)
    return null;
  return (t.exitPrice - t.entryPrice) * t.quantity;
}

const inr = (n: number) =>
  n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const CHECK_STYLE: Record<string, string> = { pass: "bg-emerald-100 text-emerald-800", warn: "bg-amber-100 text-amber-800", fail: "bg-red-100 text-red-800", skip: "bg-zinc-100 text-zinc-500" };

export function PaperClient() {
  // Prefilled from Live Signals: /paper?symbol=&exchange=&entry=&stop=&target1=&qty=&signal=&atr=&status=
  const sp = useSearchParams();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState({
    symbol: sp.get("symbol")?.toUpperCase() ?? "",
    exchange: sp.get("exchange") === "BSE" ? "BSE" : "NSE",
    entryPrice: sp.get("entry") ?? "",
    stopLoss: sp.get("stop") ?? "",
    target1: sp.get("target1") ?? "",
    quantity: sp.get("qty") ?? "",
    thesis: sp.get("signal") ? `Live Signals ${sp.get("signal")} on the ${sp.get("interval") ?? ""} chart. ` : "",
  });
  const signalCtx = {
    signal: (["BUY", "SELL", "HOLD"] as const).find((x) => x === sp.get("signal")) ?? null,
    atr: sp.get("atr") ? Number(sp.get("atr")) : null,
    dataStatus: sp.get("status") ?? null,
  };
  const [gate, setGate] = useState<GateResult | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [closing, setClosing] = useState<Trade | null>(null);
  const [closeForm, setCloseForm] = useState({ exitPrice: "", exitReason: "manual", review: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/paper");
    const d = await res.json();
    if (d.ok) setTrades(d.trades);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function runGate() {
    setGateBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/discipline/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: "long",
          entry: parseFloat(form.entryPrice),
          stop: parseFloat(form.stopLoss),
          target1: form.target1 ? parseFloat(form.target1) : null,
          quantity: parseInt(form.quantity, 10) || undefined,
          thesis: form.thesis || null,
          ...signalCtx,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setGate(d.result);
        setAcknowledge(false);
        if (!form.quantity && d.quantity) setForm({ ...form, quantity: String(d.quantity) });
      } else setMsg(`Gate error: ${d.error}`);
    } finally {
      setGateBusy(false);
    }
  }

  async function create() {
    setMsg(null);
    const res = await fetch("/api/paper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: form.symbol,
        exchange: form.exchange,
        entryPrice: parseFloat(form.entryPrice),
        stopLoss: parseFloat(form.stopLoss),
        target1: form.target1 ? parseFloat(form.target1) : null,
        quantity: parseInt(form.quantity, 10),
        thesis: form.thesis || undefined,
        status: "open",
        acknowledge,
        ...signalCtx,
      }),
    });
    const d = await res.json();
    if (d.ok) {
      setMsg(`Paper trade recorded (gate: ${d.gate?.verdict ?? "n/a"}).`);
      setForm({ ...form, symbol: "", entryPrice: "", stopLoss: "", target1: "", quantity: "", thesis: "" });
      setGate(null);
      setAcknowledge(false);
      load();
    } else {
      if (d.gate) setGate(d.gate);
      setMsg(d.needsAcknowledge ? "Review the gate warnings below, tick the acknowledgement, then record." : `Error: ${d.error}`);
    }
  }

  async function submitClose() {
    if (!closing) return;
    const res = await fetch(`/api/paper/${closing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close",
        exitPrice: parseFloat(closeForm.exitPrice),
        exitReason: closeForm.exitReason,
      }),
    });
    const d = await res.json();
    if (d.ok && closeForm.review) {
      await fetch(`/api/paper/${closing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", review: closeForm.review }),
      });
    }
    setMsg(d.ok ? "Trade closed." : `Error: ${d.error}`);
    setClosing(null);
    setCloseForm({ exitPrice: "", exitReason: "manual", review: "" });
    load();
  }

  const f = (key: keyof typeof form, label: string, width = "") => (
    <label className={`block text-xs ${width}`}>
      <span className="text-zinc-500">{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
      />
    </label>
  );

  return (
    <div className="mt-6">
      <section className="rounded-lg border border-zinc-200 p-4">
        <h2 className="text-sm font-medium text-zinc-900">Record a paper trade (long)</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {f("symbol", "Symbol")}
          <label className="block text-xs">
            <span className="text-zinc-500">Exchange</span>
            <select
              value={form.exchange}
              onChange={(e) => setForm({ ...form, exchange: e.target.value })}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            >
              <option>NSE</option>
              <option>BSE</option>
            </select>
          </label>
          {f("entryPrice", "Entry ₹")}
          {f("stopLoss", "Stop ₹")}
          {f("target1", "Target ₹ (opt)")}
          {f("quantity", "Qty")}
        </div>
        <label className="mt-3 block text-xs">
          <span className="text-zinc-500">Thesis — why this trade?</span>
          <textarea
            value={form.thesis}
            onChange={(e) => setForm({ ...form, thesis: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={runGate}
            disabled={gateBusy || !form.entryPrice || !form.stopLoss}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {gateBusy ? "Checking…" : "Run pre-trade gate"}
          </button>
          <button
            onClick={create}
            disabled={!form.symbol || !form.entryPrice || !form.stopLoss || !form.quantity || gate?.verdict === "blocked" || (gate?.verdict === "caution" && !acknowledge)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Record trade
          </button>
          {msg && <span className="text-sm text-zinc-500">{msg}</span>}
        </div>
        {gate && (
          <div className={`mt-3 rounded-md border p-3 text-xs ${gate.verdict === "go" ? "border-emerald-200 bg-emerald-50/50" : gate.verdict === "caution" ? "border-amber-200 bg-amber-50/50" : "border-red-200 bg-red-50/50"}`}>
            <p className="text-sm font-medium text-zinc-900">Pre-trade gate: <span className="uppercase">{gate.verdict}</span> <span className="font-normal text-zinc-600">— {gate.summary}</span></p>
            <p className="mt-1 text-zinc-600">Risk {gate.riskPct.toFixed(2)}% of capital ({inr(gate.riskAmount)}) · R:R {gate.rewardRisk != null ? gate.rewardRisk.toFixed(2) : "—"} · exposure after {gate.exposureAfterPct.toFixed(0)}%.</p>
            <ul className="mt-2 space-y-1">
              {gate.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${CHECK_STYLE[c.status]}`}>{c.status}</span>
                  <span className="text-zinc-700"><b>{c.label}:</b> {c.detail}</span>
                </li>
              ))}
            </ul>
            {gate.verdict === "caution" && (
              <label className="mt-2 flex items-center gap-2 text-zinc-700">
                <input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                I have read the warnings and accept them for this trade.
              </label>
            )}
            {gate.verdict === "blocked" && <p className="mt-2 font-medium text-red-700">Hard rules cannot be overridden. Fix the failing items (or wait for the circuit breaker to reset) and re-run the gate.</p>}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-zinc-900">
          All paper trades ({trades.length})
        </h2>
        <div className="mt-2 space-y-2">
          {trades.map((t) => {
            const p = pnl(t);
            return (
              <div key={t.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {t.stock.symbol} · {t.stock.exchange}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status]}`}>
                    {t.status}
                  </span>
                  {t.entryPrice != null && (
                    <span className="text-xs text-zinc-500">
                      entry ₹{t.entryPrice} · stop ₹{t.stopLoss} ·
                      {t.target1 != null && ` target ₹${t.target1} ·`} qty {t.quantity}
                    </span>
                  )}
                  {p != null && (
                    <span className={`text-xs font-medium ${p >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {p >= 0 ? "+" : ""}
                      {inr(p)}
                    </span>
                  )}
                  <span className="flex-1" />
                  {t.status === "open" && (
                    <button
                      onClick={() => setClosing(t)}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
                    >
                      Close
                    </button>
                  )}
                </div>
                {t.thesis && (
                  <p className="mt-1 text-xs text-zinc-500">Thesis: {t.thesis}</p>
                )}
                {t.review && (
                  <p className="mt-1 text-xs text-zinc-500">Review: {t.review}</p>
                )}
              </div>
            );
          })}
          {trades.length === 0 && (
            <p className="text-sm text-zinc-500">No paper trades yet.</p>
          )}
        </div>
      </section>

      {closing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setClosing(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-medium text-zinc-900">
              Close {closing.stock.symbol} paper trade
            </h3>
            <label className="mt-3 block text-xs">
              <span className="text-zinc-500">Exit price ₹</span>
              <input
                value={closeForm.exitPrice}
                onChange={(e) => setCloseForm({ ...closeForm, exitPrice: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="mt-3 block text-xs">
              <span className="text-zinc-500">Exit reason</span>
              <select
                value={closeForm.exitReason}
                onChange={(e) => setCloseForm({ ...closeForm, exitReason: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              >
                {["stop", "target1", "target2", "manual", "other"].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs">
              <span className="text-zinc-500">
                Review — did the result match the thesis?
              </span>
              <textarea
                value={closeForm.review}
                onChange={(e) => setCloseForm({ ...closeForm, review: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setClosing(null)}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={submitClose}
                disabled={!closeForm.exitPrice}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                Close trade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
