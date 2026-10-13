"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

interface PlanOk {
  ok: true;
  riskPerShare: number;
  riskRewardT1: number | null;
  riskRewardT2: number | null;
  riskBasedQty: number;
  budgetBasedQty: number;
  finalQty: number;
  capitalRequired: number;
  plannedLossAtStop: number;
  grossProfitT1: number | null;
  grossProfitT2: number | null;
  estimatedBuyCosts: number;
  warnings: string[];
}

interface PlanErr {
  ok: false;
  errors: string[];
}

const inr = (n: number) =>
  n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

export function PlannerClient() {
  // Prefilled by the Live Signals page: /planner?entry=&stop=&target1=&target2=
  const sp = useSearchParams();
  const [form, setForm] = useState({
    entryPrice: sp.get("entry") ?? "",
    stopLoss: sp.get("stop") ?? "",
    target1: sp.get("target1") ?? "",
    target2: sp.get("target2") ?? "",
    budget: "100000",
    riskPercent: "1",
    capital: "100000",
  });
  const [result, setResult] = useState<PlanOk | PlanErr | null>(null);
  const [busy, setBusy] = useState(false);

  const riskBudget =
    (parseFloat(form.capital) || 0) * ((parseFloat(form.riskPercent) || 0) / 100);

  async function compute() {
    setBusy(true);
    try {
      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryPrice: parseFloat(form.entryPrice),
          stopLoss: parseFloat(form.stopLoss),
          target1: form.target1 ? parseFloat(form.target1) : null,
          target2: form.target2 ? parseFloat(form.target2) : null,
          budget: parseFloat(form.budget),
          riskBudget,
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ ok: false, errors: ["Network error."] });
    } finally {
      setBusy(false);
    }
  }

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder = "",
    hint?: string,
  ) => (
    <label className="block">
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      <input
        inputMode="decimal"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm"
      />
      {hint && <span className="mt-1 block text-[11px] text-zinc-400">{hint}</span>}
    </label>
  );

  const canCalc = form.entryPrice && form.stopLoss && form.budget && riskBudget > 0;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-5">
      {/* ------- Inputs ------- */}
      <div className="space-y-4 lg:col-span-3">
        <section className="rounded-lg border border-zinc-200 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              1
            </span>
            <h2 className="text-sm font-semibold text-zinc-900">Price levels</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Use the entry, invalidation (stop) and target levels from the
            Research page analysis.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field("entryPrice", "Entry price (₹)", "e.g. 1024.50")}
            {field("stopLoss", "Stop-loss (₹)", "must be below entry")}
            {field("target1", "Target 1 (₹)", "optional")}
            {field("target2", "Target 2 (₹)", "optional")}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
              2
            </span>
            <h2 className="text-sm font-semibold text-zinc-900">Money &amp; risk</h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {field("capital", "Trading capital (₹)", "", "your total capital")}
            {field("riskPercent", "Risk per trade (%)", "", "1–2% is common")}
            {field("budget", "Budget for this trade (₹)", "", "max money in this stock")}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2.5">
            <span className="text-xs text-indigo-900">
              Max loss you accept on this trade:{" "}
              <b>{inr(riskBudget)}</b> ({form.riskPercent || 0}% of capital)
            </span>
          </div>
        </section>

        <button
          onClick={compute}
          disabled={busy || !canCalc}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-40 sm:w-auto sm:px-8"
        >
          {busy ? "Calculating…" : "Calculate plan →"}
        </button>
      </div>

      {/* ------- Result ------- */}
      <div className="lg:col-span-2">
        {!result && (
          <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
            <span className="text-3xl">🧮</span>
            <p className="mt-3 text-sm font-medium text-zinc-600">
              Your plan appears here
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Fill entry, stop-loss and budget, then press Calculate.
            </p>
          </div>
        )}

        {result && !result.ok && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-semibold">Cannot build this plan</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {result?.ok && (
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            {/* Headline number */}
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-5 text-white">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-200">
                Suggested quantity
              </p>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {result.finalQty}{" "}
                <span className="text-base font-medium text-indigo-200">shares</span>
              </p>
              <p className="mt-1 text-xs text-indigo-100">
                = min(risk-based {result.riskBasedQty}, budget-based{" "}
                {result.budgetBasedQty})
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-y divide-zinc-100 text-sm">
              <Cell label="Capital required" value={inr(result.capitalRequired)} />
              <Cell label="Risk per share" value={inr(result.riskPerShare)} />
              <Cell
                label="Loss if stop hits"
                value={`−${inr(result.plannedLossAtStop)}`}
                tone="red"
              />
              <Cell
                label="R:R to Target 1"
                value={
                  result.riskRewardT1 != null
                    ? `1 : ${result.riskRewardT1.toFixed(2)}`
                    : "—"
                }
                tone={
                  result.riskRewardT1 != null && result.riskRewardT1 >= 1.5
                    ? "green"
                    : undefined
                }
              />
              <Cell
                label="Profit @ Target 1"
                value={
                  result.grossProfitT1 != null ? `+${inr(result.grossProfitT1)}` : "—"
                }
                tone="green"
              />
              <Cell
                label="Profit @ Target 2"
                value={
                  result.grossProfitT2 != null ? `+${inr(result.grossProfitT2)}` : "—"
                }
                tone="green"
              />
              <Cell label="Est. buy costs" value={inr(result.estimatedBuyCosts)} />
              <Cell
                label="R:R to Target 2"
                value={
                  result.riskRewardT2 != null
                    ? `1 : ${result.riskRewardT2.toFixed(2)}`
                    : "—"
                }
              />
            </div>

            {result.warnings.length > 0 && (
              <div className="space-y-1.5 border-t border-amber-100 bg-amber-50 px-5 py-4">
                {result.warnings.map((w, i) => (
                  <p key={i} className="flex gap-2 text-xs text-amber-800">
                    <span>⚠️</span>
                    <span>{w}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "green";
}) {
  const color =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-600"
        : "text-zinc-900";
  return (
    <div className="bg-white px-5 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className={`mt-0.5 font-semibold ${color}`}>{value}</p>
    </div>
  );
}
