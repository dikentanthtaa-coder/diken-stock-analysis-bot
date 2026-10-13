# Engineering Decisions

## Phase 1 (2026-10-11)

- **Package manager: pnpm 11.5.2** — already installed, preferred per spec.
- **Framework: Next.js 16.4.0 (App Router), React 19.3, TypeScript 5.9, Tailwind CSS 4** — versions chosen by `create-next-app@latest`.
- **Scaffold workaround:** npm forbids capital letters in package names, and the
  working directory is `Dkn_BOT`. Scaffolded into `dkn-stock-app/` and moved
  files to the root; package name stays `dkn-stock-app`.
- **No deploy/commit:** `create-next-app` auto-initialized a local git repo;
  nothing is committed beyond its initial commit, and nothing is pushed.
- **Port:** dev server verified on an ad-hoc port; normal use is `pnpm dev`
  (default port 3000).

## Planned (later phases)

- SQLite + Prisma (Phase 2).
- shadcn/ui components + a candlestick charting library (added when first used,
  Phase 8 at the latest).
- Provider-independent adapters for market data (Phase 5) and AI (optional).

## Phase 2 (2026-10-11)

- **Database: SQLite via Prisma 7.10** — free, local file (`prisma/dev.db`),
  zero monthly cost, no server. Driver adapter:
  `@prisma/adapter-better-sqlite3` (Prisma 7 requires driver adapters; the
  datasource URL lives in `prisma.config.ts`, not the schema).
- **Pinned `prisma` CLI to 7.10.0** — `latest` resolved to an 8.0 RC that
  mismatched the stable client.
- **Generated client** output to `src/generated/prisma` (gitignored;
  regenerate with `pnpm db:generate`).
- **Schema covers all planned domains** up front to limit migration churn:
  stocks/candles/coverage, playlists/videos/transcripts,
  concepts/rules/conflicts, watchlists, analyses, paper trades, backtest
  runs, settings. Status/provenance fields are strings validated by Zod in
  app code (SQLite has no native enums in Prisma).
- **Env handling:** `src/lib/env.ts` (Zod-validated, `server-only`); all
  external API keys optional so the app runs with zero credentials.

## Phase 3 (2026-10-11)

- **Playlist inventory: `youtubei.js`** (open-source InnerTube client, no API
  key, ₹0). Handles both classic `PlaylistVideo` and newer `LockupView` item
  formats. Correct playlist IDs verified against YouTube directly:
  Mission 2.0 `…HHoGCS6DIQ5` (21), Elementary `…d3XPjO6igi_` (14),
  Advanced Price Action `…OpZjHgwFGaGZ` (6).
- **Transcripts: `yt-dlp` standalone binary** (`tools/yt-dlp`, gitignored;
  override with `YTDLP_PATH`). Direct timedtext fetch returns empty bodies
  (YouTube po_token requirement), so yt-dlp downloads available caption
  tracks (json3). Needs `--js-runtimes node`. Only original-language tracks
  are requested (hi/en) — these videos carry Hindi auto-captions.
- **Honest statuses:** Pending → Processing → Completed /
  TranscriptUnavailable / Failed, with `statusNote` holding the real error.
  A yt-dlp non-zero exit no longer discards tracks that did download.
- **Manual import** endpoint + UI for authorized transcripts (e.g. copied
  from YouTube's own transcript panel).
- **Next 16 `cacheComponents`:** DB-reading pages wrap content in
  `<Suspense>` instead of `export const dynamic`.

## Phases 4–9 (2026-10-11)

- **Phase 4 (KB):** deterministic glossary extraction (EN + Devanagari
  variants); "candidate rules" are verbatim transcript excerpts flagged
  `ambiguous` for human review — never invented executable rules. AI adapter
  is provider-independent; Gemini implemented but unverified (no key).
- **Phase 5 (market data):** TejHQ open tier verified keyless for
  /v1/ohlcv and /v1/actions (EOD, unadjusted). /v1/symbols and /v1/adjusted
  need a free key → optional. Yahoo public endpoints for symbol search +
  candle fallback. Provider interface isolates the analysis engine.
- **Phase 6 (analysis):** deterministic engine — swing-fractal structure,
  weekly resample, level clustering, breakout/retest detection, volume
  ratio, RSI/ATR/SMA. Evidence lists, no confidence percentages,
  conservative outcome classification.
- **Phase 7 (planner):** documented formulas; min(risk qty, budget qty);
  default all-in cost factor 1.0012; explicit warnings incl. gap risk.
- **Phase 8 (UI):** lightweight-charts for candles+volume+level lines.
  Dashboard reads DB directly (server components + Suspense).
- **Phase 9 (backtest/paper/journal):** walk-forward, fills next open,
  stop-checked-before-target, costs+slippage, 60/20/20 splits. Cache fix:
  refetch when cached history doesn't reach the requested from-date.
- **yt-dlp 429s:** YouTube rate-limits caption downloads on bursts; batch
  runs use 4–8s delays and failures stay visibly "Failed" with Retry.

## Phase 10 (2026-10-12) — Supabase + Vercel

- **Database moved from local SQLite to Supabase Postgres** so the app can
  run on Vercel (serverless has no persistent disk). Adapter:
  `@prisma/adapter-pg` (`pg` pool, `max: 3`). Schema unchanged except
  `provider = "postgresql"`; migrations regenerated as a single
  `init_postgres` migration (the SQLite history was discarded —
  `migration_lock.toml` now says postgresql).
- **Two connection strings.** App runtime uses the transaction pooler
  (port 6543, `?pgbouncer=true&connection_limit=1`) via `DATABASE_URL`;
  Prisma CLI uses `DIRECT_URL` (port 5432) from `prisma.config.ts`. Prisma 7
  config has no `directUrl` field, so the config picks
  `DIRECT_URL ?? DATABASE_URL` itself.
- **`DATABASE_URL` is now required** (`src/lib/env.ts` refuses non-postgres
  URLs) — no silent fallback to a file.
- **Data migration:** `tools/migrate-sqlite-to-postgres.ts` reads the old
  `dev.db` with Node 24's built-in `node:sqlite` (no native module) and
  `createMany(skipDuplicates)` into Postgres, parent tables first. Requires
  `@types/node` ≥ 24.
- **Build:** `pnpm build` = `prisma generate && next build`; `postinstall`
  also generates so Vercel's install step has the client. Migrations are
  applied manually with `pnpm db:deploy`, never inside the Vercel build.
- **Known gap:** `tools/yt-dlp` is a macOS binary → caption fetching only
  works locally, not on Vercel. Data written locally is shared via Supabase.

## Phase 11 (2026-10-13) — Activity log + dashboard

- **`ActivityEvent` table** (append-only) records searches, watchlist
  changes, planner runs and knowledge edits via `src/server/activity.ts`
  (`logActivity`, never throws). Analyses, paper trades, backtests and
  transcript processing are *not* duplicated there for the feed/charts —
  their canonical tables already carry full history; the feed merges both
  sources (`src/server/dashboard.ts`).
- **Search history** = the query the user typed when they picked a stock
  (sent as `query` in `/api/analysis/run`) plus knowledge-base searches
  (`/api/knowledge/search`, q ≥ 3 chars). Per-keystroke symbol lookups are
  deliberately not logged (noise).
- **Charts are hand-rolled SVG** (`src/app/charts.tsx`): stacked columns,
  line, horizontal bars; tooltips, legends, 2px surface gaps, palette from
  the dataviz reference instance validated with its script. Palette constant
  lives in `chart-colors.ts` (plain module) because constants exported from a
  `"use client"` file arrive as client references in server components.
- **Cache Components:** dashboard data calls `await connection()` before
  using the current time (IST day buckets), per Next docs.
- `/research?symbol=X&exchange=NSE` auto-runs an analysis (used by
  dashboard links to re-run).
