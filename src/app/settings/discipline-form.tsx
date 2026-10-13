"use client";

import { useEffect, useState } from "react";

type S = { capital: string; maxRiskPct: string; maxOpenPositions: string; dailyLossLimitPct: string; weeklyLossLimitPct: string };

export function DisciplineForm({ initial }: { initial: { capital: number; maxRiskPct: number; maxOpenPositions: number; dailyLossLimitPct: number; weeklyLossLimitPct: number } }) {
  const [form, setForm] = useState<S>({
    capital: String(initial.capital), maxRiskPct: String(initial.maxRiskPct), maxOpenPositions: String(initial.maxOpenPositions),
    dailyLossLimitPct: String(initial.dailyLossLimitPct), weeklyLossLimitPct: String(initial.weeklyLossLimitPct),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/discipline/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capital: Number(form.capital), maxRiskPct: Number(form.maxRiskPct), maxOpenPositions: Number(form.maxOpenPositions),
          dailyLossLimitPct: Number(form.dailyLossLimitPct), weeklyLossLimitPct: Number(form.weeklyLossLimitPct),
        }),
      });
      const d = await res.json();
      setMsg(d.ok ? "Saved." : `Error: ${d.error}`);
    } finally {
      setBusy(false);
    }
  }
  const f = (key: keyof S, label: string) => (
    <label className="block text-xs">
      <span className="text-zinc-500">{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} inputMode="decimal" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
    </label>
  );
  return (
    <div className="mt-2 rounded-md border border-zinc-200 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {f("capital", "Capital ₹")}
        {f("maxRiskPct", "Max risk / trade %")}
        {f("maxOpenPositions", "Max open positions")}
        {f("dailyLossLimitPct", "Daily loss limit %")}
        {f("weeklyLossLimitPct", "Weekly loss limit %")}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">{busy ? "Saving…" : "Save rules"}</button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}
