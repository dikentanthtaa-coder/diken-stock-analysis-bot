export const metadata = { title: "Backtest" };
import { BacktestClient } from "./ui";

export default function BacktestPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Backtesting</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Walk-forward simulation of a breakout+volume strategy on one symbol.
        No look-ahead: signals use closed bars only, fills at next open.
        Historical results never promise future profits.
      </p>
      <BacktestClient />
    </main>
  );
}
