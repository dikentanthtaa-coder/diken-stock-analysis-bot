import { Suspense } from "react";
import { ResearchClient } from "./ui";

export default function ResearchPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Stock Research</h1>
      <p className="mt-1 text-sm text-zinc-600">
        NSE/BSE equities · end-of-day data · deterministic analysis with
        knowledge-base rule matching. Not investment advice.
      </p>
      <Suspense fallback={null}>
        <ResearchClient />
      </Suspense>
    </main>
  );
}
