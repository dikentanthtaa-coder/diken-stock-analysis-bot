"use client";

import { useCallback, useEffect, useState } from "react";

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

export function PaperClient() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState({
    symbol: "",
    exchange: "NSE",
    entryPrice: "",
    stopLoss: "",
    target1: "",
    quantity: "",
    thesis: "",
  });
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
      }),
    });
    const d = await res.json();
    if (d.ok) {
      setMsg("Paper trade recorded.");
      setForm({ ...form, symbol: "", entryPrice: "", stopLoss: "", target1: "", quantity: "", thesis: "" });
      load();
    } else {
      setMsg(`Error: ${d.error}`);
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
        <button
          onClick={create}
          disabled={!form.symbol || !form.entryPrice || !form.stopLoss || !form.quantity}
          className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          Record trade
        </button>
        {msg && <span className="ml-3 text-sm text-zinc-500">{msg}</span>}
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
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
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
