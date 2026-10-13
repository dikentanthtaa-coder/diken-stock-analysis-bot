/**
 * One-shot data mover: copies every row from the old local SQLite file
 * (prisma/dev.db) into the Postgres database at DATABASE_URL (Supabase).
 *
 *   pnpm db:deploy          # create tables in Supabase first
 *   pnpm db:import-sqlite   # then run this
 *
 * Idempotent: rows whose primary key already exists are skipped, so it is
 * safe to re-run. Tables are copied parent-first so foreign keys resolve.
 */
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const SQLITE_PATH =
  process.env.SQLITE_PATH ?? path.join(process.cwd(), "prisma", "dev.db");
const BATCH = 500;

// Columns that need type conversion from SQLite's storage format.
// Everything else (text / float / int / null) passes straight through.
type Spec = { dates?: string[]; bools?: string[] };
const TABLES: Array<[string, Spec]> = [
  ["Stock", { dates: ["createdAt", "updatedAt"] }],
  ["Candle", { dates: ["date", "fetchedAt"], bools: ["adjusted"] }],
  ["DataCoverage", { dates: ["firstDate", "lastDate", "lastSync"] }],
  ["Playlist", { dates: ["lastSynced", "createdAt"] }],
  ["Video", { dates: ["publishedAt", "processedAt", "createdAt", "updatedAt"] }],
  ["Transcript", { dates: ["createdAt"] }],
  ["Concept", { dates: ["createdAt", "updatedAt"] }],
  ["StrategyRule", { dates: ["createdAt", "updatedAt"] }],
  ["RuleConflict", { dates: ["createdAt"], bools: ["resolved"] }],
  ["Watchlist", { dates: ["createdAt"] }],
  ["WatchlistItem", { dates: ["addedAt"] }],
  ["Analysis", { dates: ["asOfDate", "createdAt"] }],
  ["PaperTrade", { dates: ["entryDate", "exitDate", "createdAt", "updatedAt"] }],
  ["BacktestRun", { dates: ["createdAt", "completedAt"] }],
  ["Setting", { dates: ["updatedAt"] }],
];

// Prisma model delegate name = lowerCamel of the table name.
const delegate = (t: string) => t[0].toLowerCase() + t.slice(1);

function convert(row: Record<string, unknown>, spec: Spec) {
  const out: Record<string, unknown> = { ...row };
  for (const k of spec.dates ?? []) {
    const v = out[k];
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "number" ? new Date(v) : new Date(String(v));
  }
  for (const k of spec.bools ?? []) {
    const v = out[k];
    if (v === null || v === undefined) continue;
    out[k] = v === 1 || v === true || v === "1" || v === "true";
  }
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) {
    throw new Error("DATABASE_URL must point at Postgres (Supabase).");
  }
  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const pg = new PrismaClient({ adapter });

  console.log(`SQLite: ${SQLITE_PATH}`);
  console.log(`Postgres: ${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}\n`);

  let grand = 0;
  for (const [table, spec] of TABLES) {
    const rows = sqlite
      .prepare(`SELECT * FROM "${table}"`)
      .all() as Record<string, unknown>[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (pg as any)[delegate(table)];
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const data = rows.slice(i, i + BATCH).map((r) => convert(r, spec));
      const res = await model.createMany({ data, skipDuplicates: true });
      inserted += res.count;
    }
    grand += inserted;
    console.log(
      `${table.padEnd(14)} sqlite=${String(rows.length).padStart(5)}  inserted=${String(inserted).padStart(5)}  skipped=${rows.length - inserted}`,
    );
  }
  console.log(`\nDone. ${grand} rows inserted.`);
  await pg.$disconnect();
  sqlite.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
