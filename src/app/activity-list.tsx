import Link from "next/link";
import { KIND_LABEL, timeOfDay, dayKey, shortDay, type FeedKind } from "@/server/dashboard";

export const KIND_STYLE: Record<FeedKind, string> = {
  search: "bg-sky-100 text-sky-800",
  analysis: "bg-indigo-100 text-indigo-800",
  watchlist: "bg-teal-100 text-teal-800",
  paper: "bg-amber-100 text-amber-800",
  backtest: "bg-orange-100 text-orange-800",
  planner: "bg-violet-100 text-violet-800",
  knowledge: "bg-emerald-100 text-emerald-800",
  learning: "bg-pink-100 text-pink-800",
};

export function ActivityList({ items, grouped = false }: { items: { id: string; kind: FeedKind; title: string; href: string | null; at: Date; meta?: string | null }[]; grouped?: boolean }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-zinc-500">Nothing recorded yet.</p>;
  return (
    <ol className="mt-2 divide-y divide-zinc-100 text-sm">
      {items.map((e, i) => {
        const day = dayKey(e.at);
        const showDay = grouped && (i === 0 || dayKey(items[i - 1].at) !== day);
        return (
          <li key={e.id}>
            {showDay && <p className="pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">{shortDay(e.at)} · {day}</p>}
            <div className="flex items-start gap-2.5 py-2.5 sm:gap-3">
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
              <div className="min-w-0 flex-1">
                {e.href ? (
                  <Link href={e.href} className="block text-zinc-900 hover:text-indigo-700">{e.title}</Link>
                ) : (
                  <span className="block text-zinc-900">{e.title}</span>
                )}
                <span className="mt-0.5 block text-xs text-zinc-400 sm:hidden">
                  {grouped ? timeOfDay(e.at) : `${shortDay(e.at)} ${timeOfDay(e.at)}`}
                  {e.meta ? ` · ${e.meta}` : ""}
                </span>
                {e.meta && <span className="ml-2 hidden text-xs text-zinc-400 sm:inline">{e.meta}</span>}
              </div>
              <span className="hidden shrink-0 text-xs text-zinc-400 sm:block">{grouped ? timeOfDay(e.at) : `${shortDay(e.at)} ${timeOfDay(e.at)}`}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
