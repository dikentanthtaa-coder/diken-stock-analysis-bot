export const metadata = { title: "Live Signals" };
import { Suspense } from "react";
import { SignalsClient } from "./ui";

export default function SignalsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Live Signals</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Multi-timeframe candlestick + indicator analysis on live NSE/BSE data,
        with an explicit BUY / SELL / HOLD read, trade levels and the evidence
        behind them. Research output — not investment advice.
      </p>
      <Suspense fallback={null}>
        <SignalsClient />
      </Suspense>
    </main>
  );
}
