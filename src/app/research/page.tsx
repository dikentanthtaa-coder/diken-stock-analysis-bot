export const metadata = { title: "Research" };
import { Suspense } from "react";
import { ResearchClient } from "./ui";

export default function ResearchPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Stock Research</h1>
      <p className="mt-1 text-sm text-zinc-600">
        NSE/BSE equities · end-of-day swing analysis with knowledge-base rule
        matching. For intraday timeframes and live BUY/SELL/HOLD signals use{" "}
        <a href="/signals" className="underline">Live Signals</a>. Not investment advice.
      </p>
      <Suspense fallback={null}>
        <ResearchClient />
      </Suspense>
    </main>
  );
}
