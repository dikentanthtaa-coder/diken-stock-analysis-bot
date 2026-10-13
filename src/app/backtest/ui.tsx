"use client";

import { useState } from "react";

interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  exitReason: string;
  netReturnPct: number;
  rMultiple: number;
  bars: number;
}

interface Period {
  label: string;
  from: string;
  to: string;
  trades: Trade[];
  tradeCount: number;
  winRate: number | null;
  avgR: number | null;
  profitFactor: number | null;
  maxDrawdownPct: number | null;
}

interface RunResponse {
  ok: boolean;
  error?: string;
  symbol?: string;
  exchange?: string;
  candleCount?: number;
  result?: { periods: Period[]; limitations: string[] };
}

const DEFAULTS = {
  symbol: "",
  exchange: "NSE",
  days: "1000",
  breakoutLookback: "20",
  volMult: "1.5",
  atrStopMult: "2",
  rewardMult: "2",
  maxHoldBars: "20",
  costPctPerSide: "0.12",
  slippagePct: "0.05",
};

export function BacktestClient() {
  const [form, setForm] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<RunResponse | null>(null);
  const [showTrades, setShowTrades] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setData(null);
    try {
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol.trim().toUpperCase(),
          exchange: form.exchange,
          days: Number(form.days),
          breakoutLookback: Number(form.breakoutLookback),
          volMult: Number(form.volMult),
          atrStopMult: Number(form.atrStopMult),
          rewardMult: Number(form.rewardMult),
          maxHoldBars: Number(form.maxHoldBars),
          costPctPerSide: Number(form.costPctPerSide),
          slippagePct: Number(form.slippagePct),
        }),
      });
      setData(await res.json());
    } catch {
      setData({ ok: false, error: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  const f = (key: keyof typeof DEFAULTS, label: string) => (
    <label className="block text-xs">
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
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-3 lg:grid-cols-5">
        {f("symbol", "Symbol (e.g. INFY)")}
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
        {f("days", "History (days)")}
        {f("breakoutLookback", "Breakout lookback")}
        {f("volMult", "Volume multiple")}
        {f("atrStopMult", "ATR stop ×")}
        {f("rewardMult", "Reward ×risk")}
        {f("maxHoldBars", "Max hold (bars)")}
        {f("costPctPerSide", "Cost %/side")}
        {f("slippagePct", "Slippage %")}
      </div>
      <button
        onClick={run}
        disabled={busy || form.symbol.trim().length < 1}
        className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {busy ? "Running…" : "Run backtest"}
      </button>

      {data && !data.ok && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {data.error}
        </p>
      )}

      {data?.ok && data.result && (
        <div className="mt-6">
          <p className="text-sm text-zinc-600">
            {data.symbol} ({data.exchange}) · {data.candleCount} candles ·
            periods split 60/20/20 chronologically.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
            <table className="rtable w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Trades</th>
                  <th className="px-3 py-2">Win rate</th>
                  <th className="px-3 py-2">Avg R</th>
                  <th className="px-3 py-2">Profit factor</th>
                  <th className="px-3 py-2">Max DD</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.result.periods.map((p) => (
                  <tr key={p.label}>
                    <td data-label="Period" data-primary="" className="px-3 py-2 font-medium">{p.label}</td>
                    <td data-label="Dates" className="px-3 py-2 text-xs text-zinc-500">
                      {p.from} → {p.to}
                    </td>
                    <td data-label="Trades" className="px-3 py-2">{p.tradeCount}</td>
                    <td data-label="Win rate" className="px-3 py-2">
                      {p.winRate != null ? `${(p.winRate * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td data-label="Avg R" className="px-3 py-2">
                      {p.avgR != null ? p.avgR.toFixed(2) : "—"}
                    </td>
                    <td data-label="Profit factor" className="px-3 py-2">
                      {p.profitFactor != null
                        ? p.profitFactor === Infinity
                          ? "∞ (no losses)"
                          : p.profitFactor.toFixed(2)
                        : "—"}
                    </td>
                    <td data-label="Max DD" className="px-3 py-2">
                      {p.maxDrawdownPct != null ? `${p.maxDrawdownPct.toFixed(1)}%` : "—"}
                    </td>
                    <td data-label="Details" className="px-3 py-2">
                      {p.tradeCount > 0 && (
                        <button
                          onClick={() =>
                            setShowTrades(showTrades === p.label ? null : p.label)
                          }
                          className="text-xs underline"
                        >
                          trades
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showTrades &&
            data.result.periods
              .filter((p) => p.label === showTrades)
              .map((p) => (
                <div key={p.label} className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
                  <table className="rtable w-full text-xs">
                    <thead className="bg-zinc-50 text-left text-zinc-500">
                      <tr>
                        <th className="px-3 py-2">Entry</th>
                        <th className="px-3 py-2">Exit</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2">Bars</th>
                        <th className="px-3 py-2">Net %</th>
                        <th className="px-3 py-2">R</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {p.trades.map((t, i) => (
                        <tr key={i}>
                          <td data-label="Entry" data-primary="" className="px-3 py-1.5">
                            {t.entryDate} @ ₹{t.entryPrice.toFixed(2)}
                          </td>
                          <td data-label="Exit" className="px-3 py-1.5">
                            {t.exitDate} @ ₹{t.exitPrice.toFixed(2)}
                          </td>
                          <td data-label="Reason" className="px-3 py-1.5">{t.exitReason}</td>
                          <td data-label="Bars" className="px-3 py-1.5">{t.bars}</td>
                          <td data-label="Net %"
                            className={`px-3 py-1.5 ${t.netReturnPct >= 0 ? "text-emerald-600" : "text-red-600"}`}
                          >
                            {t.netReturnPct.toFixed(2)}%
                          </td>
                          <td data-label="R" className="px-3 py-1.5">{t.rMultiple.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

          <ul className="mt-4 rounded-md bg-zinc-50 p-3 text-xs text-zinc-500">
            {data.result.limitations.map((l, i) => (
              <li key={i}>· {l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
