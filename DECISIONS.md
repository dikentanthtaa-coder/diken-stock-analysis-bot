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

## Phase 12 (2026-10-13) — Candlewise brand, 7-day activity retention

- **Name: Stock Pilot** (user picked from four options after DKN Alpha, Candlewise and TradeForge were rejected). Logo is an original "trading bot" mark (robot head in a neon cyan→violet hexagon, visor shows a rising candlestick chart) — drawn in-house, not taken from image search, to avoid using someone else's trademarked artwork. `src/app/brand.tsx`
  holds `APP_NAME`/`APP_TAGLINE`, the SVG logo mark and wordmark; the
  favicon is `src/app/icon.svg`. Page titles use the metadata template.
- **Activity retention = 7 days.** `pruneOldActivity()` deletes
  `ActivityEvent` rows older than the window on every dashboard/activity
  load. Canonical tables (analyses, paper trades, backtests, videos) are
  never pruned; they simply fall out of the activity views after 7 days.
  The dashboard activity chart and "searches" tile use the same window.
- **Activity page pagination:** 25 per page, `?page=N&kind=…`; the whole
  week is fetched (bounded by the window) and sliced in memory.

## Phase 13 (2026-10-13) — Mobile-first responsive pass

- **Navigation:** phones get a fixed bottom tab bar (Dashboard, Research,
  Planner, Paper, More) and a "More" bottom sheet listing all pages with
  icons; tablets/desktop keep the scrollable tab bar. Sheet closes on route
  change via the state-from-props pattern (no setState in effects — the
  React Compiler lint forbids it).
- **Tables:** generic `.rtable` CSS (globals.css) turns rows into labelled
  cards under 640px using `data-label` on each `<td>` and `data-primary`
  on the identifying cell. Applied to dashboard, backtest and journal
  tables; Learning and Journal history additionally have dedicated card
  markup. Keep this pattern for any new table.
- **Ergonomics:** 16px inputs on phones (no iOS zoom), 40px tap targets,
  footer padding clears the bottom bar, tagline hidden on xs, page padding
  and h1 sizes scale down, research chart 300px tall under 640px.
- **Verification:** `scratchpad/shot.mjs` drives headless Chrome over the
  DevTools protocol with device emulation (390/320/768) — plain
  `--window-size` can't go below ~500px on macOS.

## Phase 14 (2026-10-13) — Live Signals: intraday data, patterns, BUY/SELL/HOLD

- **Intraday data source: Yahoo Finance v8 chart endpoint (keyless)**, the
  same host already used for symbol search and EOD fallback. Verified for
  NSE: 1m (7-day range, ~350 bars/day), 5m/15m (60 days), 60m (730 days),
  1d (2 years). Yahoo does not serve 4h — it is resampled from 60m bars
  anchored at the 09:15 session open (`resampleTo4h`). Yahoo appends an
  off-grid "current tick" pseudo-bar stamped with the last trade time; the
  parser drops any bar that is not on the interval grid (`isOnGrid`).
  Yahoo does **not** populate `exchangeDataDelayedBy` for NSE, so no delay
  is *claimed*; the page shows the **observed lag** (fetch time − provider's
  `regularMarketTime`) and labels LIVE only when it is ≤ 180 s, else
  DELAYED. Observed on 2026-10-13: 76 s lag mid-session, then the quote
  timestamp stalled for ~10 min before the close and the UI flipped to
  DELAYED on its own — exactly the honest behaviour wanted.
- **Licensed option: Twelve Data** (`TWELVEDATA_API_KEY`; free tier 8
  req/min, 800/day, NSE/BSE listed). Adapter `twelvedata.ts` becomes the
  primary intraday provider when the key is set, Yahoo stays as fallback.
  **Unverified** until a key is exercised (same convention as Gemini in
  Phase 4) — Settings says so.
- **No DB persistence for intraday bars.** A per-instance memory cache with
  TTL by timeframe (15 s for 1m … 5 min for 1d, ≥ 5 min when the market is
  closed), in-flight de-duplication, a 60 s cool-down after a 429, and
  stale-cache fallback marked `status: "stale"`. Nothing is ever synthesised:
  with no cache and all providers failing the API returns 502/404 with the
  provider messages.
- **Market hours** are derived from the IST clock (09:15–15:30 Mon–Fri);
  exchange holidays are unknown, so a holiday weekday shows DELAYED with a
  note instead of pretending to be live.
- **Engine (`src/server/signal/engine.ts`) is pure and lookahead-free**:
  `buildSeries` precomputes EMA20/50/200, SMA20, RSI14, MACD 12/26/9,
  Bollinger 20/2 (population SD), session VWAP (rolling 20-bar VWAP on
  daily/weekly), ATR14, volume SMA20 and fractal swings; `scoreAt(series, i)`
  uses bars [0..i] only (swings must be confirmed by bar i). The live page
  scores the **last closed bar** (a forming bar is shown on the chart but
  excluded) so signals do not repaint. Per-timeframe score ∈ [−100, 100] =
  trend (≤ ±35) + momentum (≤ ±25) + Bollinger (≤ ±10) + VWAP (≤ ±8) +
  volume (≤ ±12, and a 0.85 damping when volume < 0.7× average) +
  candlestick patterns (≤ ±15) + levels/breakouts (≤ ±10).
- **Multi-timeframe vote:** ladder = primary, next two higher, plus daily
  (`ladderFor`); a daily primary uses a resampled weekly anchor. Weights
  0.4/0.25/0.2/0.15 renormalised over usable timeframes. BUY needs combined
  ≥ 25, agreement ≥ 0.6 and daily score > −20 (SELL mirrored). Confidence =
  0.6·|combined| + 0.4·agreement, halved on stale data, ×0.8 delayed, ×0.9
  closed, capped at 95, always captioned "agreement, not probability".
- **Candlestick patterns (`patterns.ts`)**: Doji (+ Dragonfly/Gravestone),
  Hammer, Hanging Man, Inverted Hammer, Shooting Star, Marubozu, Bullish/
  Bearish Engulfing, Harami, Piercing Line, Dark Cloud Cover, Tweezers,
  Morning/Evening Star, Three White Soldiers/Black Crows. Reversal patterns
  require a prior trend (close moved ≥ 1 average range over 6 bars).
- **Trade plan**: entry = last closed primary close; stop = 0.25 ATR beyond
  the nearest swing level if it sits 0.5–3 ATR away, else 1.5 ATR; T1 = the
  nearest opposing level if ≥ 1 R away else 1.5 R; T2 = 2.5 R. Planner is
  prefilled via `/planner?entry=&stop=&target1=&target2=`.
- **Signal backtest (`backtest/signal.ts`)** replays `scoreAt` bar by bar
  with the same higher-timeframe veto (closed daily bars looked up by time;
  weekly for a daily primary), fills at next open with slippage, costs per
  side, ATR stop checked before target, score-reversal and time exits,
  60/20/20 splits reusing `summarize`. Daily backtests use the EOD cache
  (first fetch of a new symbol is slow because `getCandles` upserts one row
  per candle — pre-existing behaviour). First real runs (RELIANCE 15m, INFY
  1d, bearish 2025–26 tape) were net negative — reported as-is; the
  thresholds are not tuned per symbol.
- **UI**: `/signals` (search, 1m–1d tabs, auto-refresh paced by
  `INTERVAL_SPEC.pollMs`, slowed to ≥ 5 min when the market is closed and
  paused while the tab is hidden), lightweight-charts with EMA/BB/VWAP
  overlays, pattern markers, entry/stop/target price lines, multi-timeframe
  table, factor breakdown, reasons and cautions. The server returns the last
  600 bars; overlays are recomputed client-side from the same pure engine.
  Signals is in the phone bottom bar (Dashboard · Signals · Research · Paper).
- **Cache Components gotcha:** `/backtest` now reads `searchParams`; it must
  be awaited inside a `<Suspense>` child or `next dev` logs "encountered
  runtime data during prerendering".
- **StrictMode gotcha:** the "run once from URL" effects set the ran-flag
  inside the timeout callback; setting it before `return () => clearTimeout`
  silently skips the run under dev double-invocation.

## Phase 15 (2026-10-13) — Trading-discipline methodology ported from Claude skills

User asked to "integrate" several Claude-skill resources (Claude Academy
financial-analysis prompting + financial-services skills, the Agensi
trading marketplace, tradermonty/claude-trading-skills, mcpmarket
stock-analyzer). None are application code; most need paid US-centric
APIs (FMP, Alpaca, FINVIZ) or fundamentals we do not have (DCF, comps,
earnings). What was ported is **methodology**, implemented natively:

- **Market regime / exposure ceiling** (from `market-breadth-analyzer`,
  `ibd-distribution-day-monitor`, `exposure-coach`): `regime-calc.ts`
  scores NIFTY 50 (vs 50/200 DMA, % off 52-wk high, 10-day return, IBD
  distribution days over 25 sessions — Yahoo serves index volume for
  ^NSEI/^CRSLDX), NIFTY 500 as a breadth proxy, and India VIX, into
  confirmed-uptrend / under-pressure / rally-attempt / correction with an
  exposure ceiling (100/50/30/20 %, cut by distribution days, VIX ≥ 25/30,
  weak breadth). Index symbols start with `^` and take no Yahoo suffix.
  Cached 10 min. **A correction vetoes BUY** in `combineSignals`; pressure
  damps confidence ×0.85. Dashboard shows the posture card.
- **Pre-trade discipline gate + circuit breaker** (from
  `pre-trade-discipline-gate`, `drawdown-circuit-breaker`,
  `position-sizer`): `discipline/gate.ts` (pure) checks stop placement vs
  ATR, risk ≤ max % of capital, R:R ≥ 1.5, daily/weekly realised-loss
  limits from closed paper trades, exposure vs the market ceiling, open
  position count, agreement with the live signal and daily trend, data
  freshness, and a written thesis. Verdict go / caution / blocked.
  `POST /api/paper` **enforces it**: blocked → 422, caution → 409 until
  `acknowledge: true`; the verdict is appended to the thesis. Rules live in
  the `Setting` row `discipline` (editable in Settings). Auto-sizing =
  min(risk-rule qty, capital qty, ceiling qty).
- **Forward-tested live record** (from `signal-postmortem`,
  `trader-memory-core`): new `SignalEvent` table (migration
  `20261013120000_signal_events`, applied to Supabase). Every BUY/SELL the
  engine emits is written once per (stock, interval, signal, bar), with a
  20-bar pending-dedupe so polling does not spam. `evaluatePendingSignals`
  grades events against later closed bars (stop before target intrabar,
  expired after 40 bars at the open R, MFE/MAE in R) when the Journal,
  Dashboard or `/api/signal/record` is loaded. Intraday history limits
  (7 d for 1m, 60 d for 5m/15m) mean grading must happen within that
  window — it does, because the pages grade on load.
- **Minervini trend template** (from `vcp-screener` / breakout picker):
  8 daily checks; RS is a self-relative 6-month proxy (a real RS rating
  needs a universe). Shown on Signals; a BUY on a non-Stage-2 stock gets a
  caution and ×0.9 confidence. CAN SLIM was not ported (needs EPS data).
- **Indicators from stock-analyzer:** ADX(14) with ±DI (ADX < 20 discounts
  trend factors by 40 %; ≥ 25 adds ±6 for the dominant DI), Stochastic
  14/3 crosses from extremes (±6), OBV 20-bar divergence/confirmation (±4
  / ±3). News sentiment was not ported (no licensed news feed).
- **AI narrative** (from the Claude Academy prompting guidance): optional
  `AI_PROVIDER=claude` provider in `ai/adapter.ts` using `@anthropic-ai/sdk`
  (`claude-opus-5-5`, adaptive thinking, effort medium, server-side refusal
  fallback `fallbacks: "default"`, cached system prompt). The prompt
  (`signal/narrative.ts`) names the ticker, every metric with its value,
  the data source and freshness, the engine's decision thresholds, and a
  fixed five-paragraph format; the model may only restate the numbers
  given. The narrative never changes the signal. **Unverified until a key
  is set** (same convention as Gemini).
- Not ported, deliberately: DCF/comps/earnings skills (no fundamentals
  provider), crypto/DeFi/prediction-market skills, anything that places
  orders. The breakout-picker and technical-scanner products are paid
  closed skills; only their publicly described rules informed the above.
