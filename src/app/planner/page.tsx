export const metadata = { title: "Planner" };
import { PlannerClient } from "./ui";

export default function PlannerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Trade Planner</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Long swing trades only. Quantity = min(risk-based, budget-based).
        Research tool — nothing here places orders.
      </p>
      <PlannerClient />
    </main>
  );
}
