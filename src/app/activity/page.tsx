import { Suspense } from "react";
import Link from "next/link";
import { PageLoader } from "../loader";
import { ActivityList } from "../activity-list";
import { getActivityPage, KIND_LABEL, ACTIVITY_WINDOW_DAYS, ACTIVITY_PAGE_SIZE, type FeedKind } from "@/server/dashboard";

export const metadata = { title: "Activity" };

const KINDS = Object.keys(KIND_LABEL) as FeedKind[];
type Params = Promise<{ kind?: string; page?: string }>;

export default function ActivityPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoader label="Loading activity" />}>
      <ActivityContent searchParams={searchParams} />
    </Suspense>
  );
}

function pageHref(kind: FeedKind | undefined, page: number) {
  const q = new URLSearchParams();
  if (kind) q.set("kind", kind);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return qs ? `/activity?${qs}` : "/activity";
}

function pageNumbers(current: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

async function ActivityContent({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const active = KINDS.includes(sp.kind as FeedKind) ? (sp.kind as FeedKind) : undefined;
  const requested = Number.parseInt(sp.page ?? "1", 10) || 1;
  const { items, total, page, pages } = await getActivityPage(requested, active);
  const from = total === 0 ? 0 : (page - 1) * ACTIVITY_PAGE_SIZE + 1;
  const to = Math.min(total, page * ACTIVITY_PAGE_SIZE);

  const chip = (href: string, label: string, on: boolean) => (
    <Link
      key={href}
      href={href}
      className={`rounded-full border px-3 py-1 ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}
    >
      {label}
    </Link>
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:py-8">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Activity</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Every search, analysis, trade, backtest and learning action from the last {ACTIVITY_WINDOW_DAYS} days, newest first (IST).
        Older activity is removed automatically.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
        {chip("/activity", "All", !active)}
        {KINDS.map((k) => chip(`/activity?kind=${k}`, KIND_LABEL[k], active === k))}
      </div>

      <section className="mt-4 rounded-lg border border-zinc-200 px-4 pb-2">
        <ActivityList items={items} grouped />
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-xs text-zinc-500">
          {total === 0 ? "No activity in this period." : `Showing ${from}–${to} of ${total}${active ? ` · ${KIND_LABEL[active]}` : ""}`}
        </p>
        {pages > 1 && (
          <nav aria-label="Pagination" className="flex items-center gap-1">
            <PageLink href={pageHref(active, page - 1)} disabled={page <= 1}>
              ← Prev
            </PageLink>
            {pageNumbers(page, pages).map((n, i) =>
              n === "…" ? (
                <span key={`gap-${i}`} className="px-1 text-zinc-400">…</span>
              ) : (
                <PageLink key={n} href={pageHref(active, n)} current={n === page}>
                  {n}
                </PageLink>
              ),
            )}
            <PageLink href={pageHref(active, page + 1)} disabled={page >= pages}>
              Next →
            </PageLink>
          </nav>
        )}
      </div>
    </main>
  );
}

function PageLink({ href, children, disabled, current }: { href: string; children: React.ReactNode; disabled?: boolean; current?: boolean }) {
  const base = "min-w-8 rounded-md border px-2.5 py-1 text-center text-xs";
  if (disabled) return <span className={`${base} border-zinc-200 text-zinc-300`}>{children}</span>;
  if (current) return <span aria-current="page" className={`${base} border-indigo-600 bg-indigo-600 font-medium text-white`}>{children}</span>;
  return <Link href={href} className={`${base} border-zinc-300 text-zinc-700 hover:bg-zinc-50`}>{children}</Link>;
}
