export const metadata = { title: "Backtest" };
import { Suspense } from "react";
import { BacktestClient } from "./ui";
import { SignalBacktestClient } from "./signal-ui";
import { StrategyTabs } from "./tabs";

export default function BacktestPage({
  searchParams,
}: {
  searchParams: Promise<{ strategy?: string }>;
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Backtesting</h1>
      <Suspense fallback={null}>
        <BacktestBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function BacktestBody({ searchParams }: { searchParams: Promise<{ strategy?: string }> }) {
  const { strategy } = await searchParams; // runtime data: read inside Suspense
  const signal = strategy === "signal";
  return (
    <>
      <p className="mt-1 text-sm text-zinc-600">
        {signal
          ? "Walk-forward test of the Live Signals engine on one symbol and timeframe: every closed bar is scored exactly as the live page does, with the higher-timeframe veto; BUY fills at the next open with costs and slippage; exits on ATR stop, R-multiple target, score reversal or time."
          : "Walk-forward simulation of a breakout+volume strategy on one symbol. No look-ahead: signals use closed bars only, fills at next open."}{" "}
        Historical results never promise future profits.
      </p>
      <StrategyTabs active={signal ? "signal" : "breakout"} />
      {signal ? <SignalBacktestClient /> : <BacktestClient />}
    </>
  );
}
