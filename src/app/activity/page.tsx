import { Suspense } from "react";
import Link from "next/link";
import { PageLoader } from "../loader";
import { ActivityList } from "../activity-list";
import { getActivityFeed, KIND_LABEL, type FeedKind } from "@/server/dashboard";

const KINDS = Object.keys(KIND_LABEL) as FeedKind[];

export default function ActivityPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  return (
    <Suspense fallback={<PageLoader label="Loading activity" />}>
      <ActivityContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivityContent({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const active = KINDS.includes(kind as FeedKind) ? (kind as FeedKind) : undefined;
  const items = await getActivityFeed(300, active);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Activity history</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Every search, analysis, trade, backtest and learning action, newest first (IST).
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
        <Link href="/activity" className={`rounded-full border px-3 py-1 ${!active ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}>All</Link>
        {KINDS.map((k) => (
          <Link key={k} href={`/activity?kind=${k}`} className={`rounded-full border px-3 py-1 ${active === k ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}>
            {KIND_LABEL[k]}
          </Link>
        ))}
      </div>
      <section className="mt-4 rounded-lg border border-zinc-200 px-4 pb-2">
        <ActivityList items={items} grouped />
      </section>
      <p className="mt-3 text-xs text-zinc-400">Showing up to 300 most recent items{active ? ` of type ${KIND_LABEL[active]}` : ""}.</p>
    </main>
  );
}
