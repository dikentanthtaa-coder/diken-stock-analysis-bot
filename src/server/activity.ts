import "server-only";
import { db } from "@/lib/db";

export type ActivityKind =
  | "search"
  | "analysis"
  | "watchlist"
  | "paper"
  | "backtest"
  | "planner"
  | "knowledge"
  | "learning";

export interface ActivityInput {
  kind: ActivityKind;
  title: string;
  detail?: Record<string, unknown>;
  symbol?: string | null;
  exchange?: string | null;
  href?: string | null;
}

/**
 * Append an event to the activity log. Never throws — logging must not
 * break the request that triggered it.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await db.activityEvent.create({
      data: {
        kind: input.kind,
        title: input.title.slice(0, 200),
        detail: input.detail ? JSON.stringify(input.detail) : null,
        symbol: input.symbol ?? null,
        exchange: input.exchange ?? null,
        href: input.href ?? null,
      },
    });
  } catch (error) {
    console.error("[activity] failed to log", input.kind, error);
  }
}
