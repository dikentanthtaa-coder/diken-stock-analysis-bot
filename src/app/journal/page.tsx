export const metadata = { title: "Journal" };
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { PageLoader } from "../loader";
import { evaluatePendingSignals, getLiveRecord } from "@/server/signal/postmortem";

export default function JournalPage() {
  return (
    <Suspense
      fallback={
        <PageLoader label="Loading journal" />
      }
    >
      <JournalContent />
    </Suspense>
  );
}

const OUTCOME_LABEL: Record<string, string> = {
  PotentialBuySetup: "Potential Buy Setup",
  WatchlistWait: "Watchlist — Wait",
  NoTrade: "No Trade",
  InsufficientData: "Insufficient Data",
  ReviewPosition: "Review Position",
};

const dtFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

async function JournalContent() {
  await connection(); // grading reads live bars at request time
  await evaluatePendingSignals().catch((e) => console.error("[journal] grading failed", e));
  const record = await getLiveRecord({ take: 40 }).catch(() => null);
  const [closedTrades, analyses, backtests] = await Promise.all([
    db.paperTrade.findMany({
      where: { status: "closed" },
      include: { stock: { select: { symbol: true, exchange: true } } },
      orderBy: { exitDate: "desc" },
      take: 50,
    }),
    db.analysis.findMany({
      include: { stock: { select: { symbol: true, exchange: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.backtestRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const closedPnls = closedTrades
    .filter((t) => t.entryPrice != null && t.exitPrice != null && t.quantity != null)
    .map((t) => (t.exitPrice! - t.entryPrice!) * t.quantity!);
  const totalPnl = closedPnls.reduce((a, b) => a + b, 0);
  const wins = closedPnls.filter((p) => p > 0).length;

  const inr = (n: number) =>
    n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Trade Journal</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Paper-trade outcomes vs original theses, analysis history, and
        backtest runs. Everything here is hypothetical research.
      </p>

      <section className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg border border-zinc-200 p-3 sm:p-4">
          <p className="text-xl font-semibold text-zinc-900 sm:text-2xl">{closedTrades.length}</p>
          <p className="text-xs text-zinc-500">closed paper trades</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 sm:p-4">
          <p className="text-xl font-semibold text-zinc-900 sm:text-2xl">
            {closedPnls.length ? `${wins}/${closedPnls.length}` : "—"}
          </p>
          <p className="text-xs text-zinc-500">winners</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 sm:p-4">
          <p
            className={`text-xl font-semibold sm:text-2xl ${totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {closedPnls.length ? inr(totalPnl) : "—"}
          </p>
          <p className="text-xs text-zinc-500">hypothetical net P/L (gross, no costs)</p>
        </div>
      </section>

      <section className="mt-8" id="signal-record">
        <h2 className="font-medium text-zinc-900">Live Signals record — forward-tested</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Every BUY/SELL the engine emitted, graded afterwards on closed bars: did price reach target 1 before the stop
          (stop first within a bar; expired after {record?.maxBars ?? 40} bars at the open R)? Nothing here is back-fitted.
        </p>
        {!record || record.totals.total === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No signals recorded yet. Open Live Signals; each BUY/SELL is logged automatically.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {[
                ["Signals", `${record.totals.total}`],
                ["Graded", `${record.totals.evaluated}`],
                ["Target-1 before stop", record.totals.hitRate != null ? `${(record.totals.hitRate * 100).toFixed(0)}%` : "—"],
                ["Avg result", record.totals.avgResultR != null ? `${record.totals.avgResultR > 0 ? "+" : ""}${record.totals.avgResultR}R` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-lg font-semibold tabular-nums text-zinc-900">{v}</p>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-400">{k}</p>
                </div>
              ))}
            </div>
            {record.rows.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
                <table className="rtable w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                    <tr><th className="px-3 py-2">Timeframe</th><th className="px-3 py-2">Signal</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Target 1</th><th className="px-3 py-2">Stop</th><th className="px-3 py-2">Expired</th><th className="px-3 py-2">Hit rate</th><th className="px-3 py-2">Avg R</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {record.rows.map((r) => (
                      <tr key={`${r.interval}-${r.signal}`}>
                        <td data-label="Timeframe" data-primary="" className="px-3 py-2 font-medium">{r.interval}</td>
                        <td data-label="Signal" className={`px-3 py-2 font-medium ${r.signal === "BUY" ? "text-emerald-700" : "text-red-700"}`}>{r.signal}</td>
                        <td data-label="Total" className="px-3 py-2">{r.total}</td>
                        <td data-label="Target 1" className="px-3 py-2">{r.target1}</td>
                        <td data-label="Stop" className="px-3 py-2">{r.stop}</td>
                        <td data-label="Expired" className="px-3 py-2">{r.expired}</td>
                        <td data-label="Hit rate" className="px-3 py-2">{r.hitRate != null ? `${(r.hitRate * 100).toFixed(0)}%` : "—"}</td>
                        <td data-label="Avg R" className="px-3 py-2">{r.avgResultR != null ? r.avgResultR.toFixed(2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 space-y-1">
              {record.recent.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 rounded-md border border-zinc-200 px-3 py-1.5 text-xs">
                  <span><b className={e.signal === "BUY" ? "text-emerald-700" : "text-red-700"}>{e.signal}</b> {e.symbol} {e.interval} · {dtFmt.format(new Date(e.barTime))} · entry {e.entry.toFixed(2)} stop {e.stop.toFixed(2)} T1 {e.target1.toFixed(2)} · conf {e.confidence}</span>
                  <span className={e.outcome === "target1" ? "text-emerald-700" : e.outcome === "stop" ? "text-red-700" : "text-zinc-500"}>
                    {e.outcome}{e.resultR != null ? ` (${e.resultR > 0 ? "+" : ""}${e.resultR}R)` : ""}{e.outcome === "pending" ? ` · ${e.barsChecked} bars` : ""}{e.mfeR != null ? ` · MFE ${e.mfeR}R / MAE ${e.maeR}R` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-zinc-900">Closed trades — thesis vs result</h2>
        {closedTrades.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            Nothing closed yet. Close paper trades with a review to build this view.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {closedTrades.map((t) => {
              const p =
                t.entryPrice != null && t.exitPrice != null && t.quantity != null
                  ? (t.exitPrice - t.entryPrice) * t.quantity
                  : null;
              return (
                <div key={t.id} className="rounded-lg border border-zinc-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {t.stock.symbol} · {t.stock.exchange}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {t.entryDate?.toISOString().slice(0, 10)} →{" "}
                      {t.exitDate?.toISOString().slice(0, 10)} · exit: {t.exitReason}
                    </span>
                    {p != null && (
                      <span
                        className={`text-xs font-medium ${p >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {p >= 0 ? "+" : ""}
                        {inr(p)}
                      </span>
                    )}
                  </div>
                  {t.thesis && (
                    <p className="mt-1 text-xs text-zinc-600">
                      <b>Thesis:</b> {t.thesis}
                    </p>
                  )}
                  {t.review ? (
                    <p className="mt-1 text-xs text-zinc-600">
                      <b>Review:</b> {t.review}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-amber-600">
                      No review recorded — add one on the Paper page.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-zinc-900">Analysis history</h2>
        {analyses.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No analyses saved yet.</p>
        ) : (
          <>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 md:hidden">
            {analyses.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {a.stock.symbol} <span className="font-normal text-zinc-400">{a.stock.exchange}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} · as of {a.asOfDate.toISOString().slice(0, 10)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                  {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 hidden overflow-x-auto rounded-lg border border-zinc-200 md:block">
            <table className="rtable w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Stock</th>
                  <th className="px-3 py-2">Outcome</th>
                  <th className="px-3 py-2">As of</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {analyses.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Date" data-primary="" className="px-3 py-2 text-xs text-zinc-500">
                      {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td data-label="Stock" className="px-3 py-2 font-medium">
                      {a.stock.symbol} · {a.stock.exchange}
                    </td>
                    <td data-label="Outcome" className="px-3 py-2">{OUTCOME_LABEL[a.outcome] ?? a.outcome}</td>
                    <td data-label="As of" className="px-3 py-2 text-xs text-zinc-500">
                      {a.asOfDate.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-zinc-900">Backtest runs</h2>
        {backtests.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No backtests run yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {backtests.map((b) => (
              <li key={b.id} className="rounded-md border border-zinc-200 px-3 py-2">
                <span className="font-medium">{b.name}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {b.status} · {b.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                {b.error && <span className="ml-2 text-xs text-red-500">{b.error.slice(0, 80)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
