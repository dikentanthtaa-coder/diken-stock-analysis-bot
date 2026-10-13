export const metadata = { title: "Paper trading" };
import { PaperClient } from "./ui";

export default function PaperPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Paper Trading</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Hypothetical trades only — nothing is sent to any broker. Record the
        thesis when you enter so the journal can compare it with the outcome.
      </p>
      <PaperClient />
    </main>
  );
}
