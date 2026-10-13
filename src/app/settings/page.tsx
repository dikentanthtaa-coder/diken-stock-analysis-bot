export const metadata = { title: "Settings" };
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { providerHealth } from "@/server/market/service";

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-zinc-500">
          Checking providers…
        </main>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  await connection(); // live health checks — always render at request time
  const [health, stockCount, candleCount, videoCount, analysisCount] =
    await Promise.all([
      providerHealth(),
      db.stock.count(),
      db.candle.count(),
      db.video.count(),
      db.analysis.count(),
    ]);

  const keyStatus = (v: string) => (v ? "configured" : "not set (optional)");

  return (
    <main className="mx-auto max-w-4xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Settings & Status</h1>

      <section className="mt-6">
        <h2 className="font-medium text-zinc-900">Market data providers</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {health.map((h) => (
            <li
              key={h.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-200 p-3"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${h.ok ? "bg-emerald-500" : "bg-red-500"}`}
              />
              <span className="font-medium uppercase">{h.id}</span>
              <span className="text-zinc-500">{h.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          TejHQ open tier is keyless EOD data (updated ~18:30 IST on trading
          days). A free key from tejhq.dev/keys raises limits and unlocks
          adjusted prices — put it in <code>.env</code> as{" "}
          <code>MARKET_DATA_API_KEY</code>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-zinc-900">API keys (server-side only)</h2>
        <dl className="mt-2 grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-[14rem_1fr] sm:gap-y-2">
          <dt className="text-xs text-zinc-500 sm:text-sm">MARKET_DATA_API_KEY</dt>
          <dd className="mb-2 sm:mb-0">{keyStatus(env.MARKET_DATA_API_KEY)}</dd>
          <dt className="text-xs text-zinc-500 sm:text-sm">AI_PROVIDER / AI_API_KEY</dt>
          <dd className="mb-2 sm:mb-0">
            {env.AI_PROVIDER && env.AI_API_KEY
              ? `configured (${env.AI_PROVIDER}) — unverified until first use`
              : "not set (optional — heuristic extraction active)"}
          </dd>
          <dt className="text-xs text-zinc-500 sm:text-sm">YOUTUBE_API_KEY</dt>
          <dd className="mb-2 sm:mb-0">{keyStatus(env.YOUTUBE_API_KEY)}</dd>
        </dl>
        <p className="mt-2 text-xs text-zinc-500">
          Keys live in <code>.env</code> (gitignored) and never reach the
          browser. Template: <code>.env.example</code>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-zinc-900">Database (Supabase Postgres)</h2>
        <dl className="mt-2 grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-[14rem_1fr] sm:gap-y-2">
          <dt className="text-xs text-zinc-500 sm:text-sm">Stocks cached</dt>
          <dd className="mb-2 sm:mb-0">{stockCount}</dd>
          <dt className="text-xs text-zinc-500 sm:text-sm">Daily candles cached</dt>
          <dd className="mb-2 sm:mb-0">{candleCount}</dd>
          <dt className="text-xs text-zinc-500 sm:text-sm">Videos tracked</dt>
          <dd className="mb-2 sm:mb-0">{videoCount}</dd>
          <dt className="text-xs text-zinc-500 sm:text-sm">Analyses saved</dt>
          <dd className="mb-2 sm:mb-0">{analysisCount}</dd>
          <dt className="text-xs text-zinc-500 sm:text-sm">Connection</dt>
          <dd className="mb-2 sm:mb-0">
            <code>DATABASE_URL</code> (env, never shown)
          </dd>
        </dl>
      </section>

      <section className="mt-8 rounded-md bg-zinc-50 p-4 text-xs text-zinc-500">
        <p>
          · All data is end-of-day; nothing in this app is real-time or an
          order-placement facility.
        </p>
        <p>
          · Monthly cost of the current setup: ₹0 (Supabase free tier, Vercel Hobby, keyless free
          data tiers, no paid AI).
        </p>
        <p>
          · Free tiers can change their terms — if a provider starts failing,
          check the Settings health panel first.
        </p>
      </section>
    </main>
  );
}
