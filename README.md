# TradeForge — swing-trading research for NSE & BSE

Personal swing-trading **research and decision-support** web app for Indian
(NSE/BSE) equities. Local, single-user, ₹0/month. **Not a broker, not an
order-placement tool, not investment advice.**

## What it does

- **YouTube Learning** — inventories the three GTF playlists (Trading In The
  Zone Mission 2.0 / Elementary, Advanced Price Action), downloads available
  caption tracks (Hindi auto-captions) via yt-dlp, tracks per-video status
  (Pending / Processing / Completed / TranscriptUnavailable / Failed), and
  supports manual import of authorized transcripts.
- **Knowledge Base** — deterministic extraction of trading concepts (glossary
  matching, English + Devanagari) and verbatim rule-like excerpts, all linked
  to source video + timestamp. Searchable across concepts, rules, and full
  transcripts. Optional AI extraction (Gemini) if a key is configured.
- **Stock Research** — symbol search (Yahoo), EOD candles (TejHQ keyless open
  tier, Yahoo fallback), candlestick chart, deterministic analysis: weekly +
  daily structure trend, swing-based S/R levels, breakout/retest/breakdown,
  volume confirmation, RSI/ATR/SMAs, bullish/bearish/sideways scenarios with
  explicit evidence for and against, confirmation and invalidation conditions,
  and knowledge-base rules matched to current signals. Outcomes:
  Potential Buy Setup / Watchlist-Wait / No Trade / Insufficient Data.
- **Trade Planner** — long-swing position sizing:
  risk/share = entry − stop; risk qty = floor(risk budget ÷ risk/share);
  budget qty = floor(budget ÷ all-in cost/share); final = min of both.
  R:R, loss-at-stop, profit at targets, estimated costs, gap-risk warnings.
- **Backtesting** — walk-forward breakout+volume simulation, no look-ahead
  (fills at next open), stop-before-target intrabar convention, costs +
  slippage, 60/20/20 development/validation/out-of-sample split, win rate,
  expectancy (avg R), profit factor, max drawdown, full trade list.
- **Paper Trading + Journal** — record hypothetical trades with a thesis,
  close with exit reason, review vs thesis; journal shows analysis history
  and backtest runs. Everything persists in Postgres (Supabase).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Prisma 7 +
Postgres on Supabase (`@prisma/adapter-pg`) · Zod · lightweight-charts · youtubei.js ·
yt-dlp (binary in `tools/`, not committed — see Setup) · Vitest.

## Setup

1. Create a free project at [supabase.com](https://supabase.com) and copy the
   two connection strings from **Connect** (transaction pooler, port 6543,
   and session pooler, port 5432).

```bash
pnpm install
cp .env.example .env            # paste DATABASE_URL + DIRECT_URL; API keys optional
pnpm db:deploy                  # creates the tables in Supabase
pnpm dev                        # http://localhost:3000
```

For caption fetching, download yt-dlp into `tools/` (gitignored):

```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o tools/yt-dlp && chmod +x tools/yt-dlp
```

Upgrading from the old local SQLite build? Keep `prisma/dev.db` and run
`pnpm db:import-sqlite` once after `pnpm db:deploy` — it copies every row
(playlists, transcripts, concepts, rules, candles, trades) into Supabase and is
safe to re-run.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js).
2. In **Settings → Environment Variables** add `DATABASE_URL` (the pooled
   6543 URL with `?pgbouncer=true&connection_limit=1`) and `DIRECT_URL`, plus
   any optional API keys.
3. Deploy. `pnpm build` runs `prisma generate` first, so no extra build
   command is needed. Schema changes are applied from your machine with
   `pnpm db:deploy`, not during the Vercel build.

Known limitation: caption fetching uses the bundled macOS `tools/yt-dlp`
binary, which cannot run on Vercel's Linux functions. Process videos locally
(the data lands in the same Supabase DB), or set `YTDLP_PATH` to a Linux
build in a custom runtime.

First use: open **Learning** → "Fetch playlist inventory" → process videos
(YouTube rate-limits subtitle downloads; failed ones get a Retry button).
Then **Knowledge** → "Run extraction". Research/Planner/Backtest work
immediately.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | dev server |
| `pnpm build` | production build |
| `pnpm test` | unit tests (extraction, validation, indicators, planner, backtest) |
| `pnpm db:deploy` | apply migrations to Supabase (local + before deploys) |
| `pnpm db:migrate` / `db:generate` / `db:studio` | Prisma utilities (`db:migrate` for new schema changes) |
| `pnpm db:import-sqlite` | one-time copy of old `prisma/dev.db` data into Supabase |

## Data sources & costs

| Source | Used for | Cost | Notes |
| --- | --- | --- | --- |
| TejHQ open tier | EOD OHLCV, corporate actions | ₹0, keyless | updated ~18:30 IST trading days; free key raises limits (`MARKET_DATA_API_KEY`) |
| Yahoo Finance public endpoints | symbol search, candle fallback | ₹0, keyless | unofficial endpoints — may change |
| YouTube via yt-dlp | caption tracks | ₹0 | rate-limited (HTTP 429) on bursts; retry later |
| Gemini (optional) | AI rule extraction | free tier available | app fully works without it |

**All market data is end-of-day — never real-time.** Prices are unadjusted
bhavcopy values; corporate actions can distort long histories. Free tiers can
change or disappear; the Settings page has a live provider health check.

Hosting: Vercel Hobby + Supabase free tier (500 MB Postgres; pauses after a
week of inactivity — open the dashboard to resume). Optional future costs:
paid market data (adjusted/intraday), paid AI.

## Honest limitations

- Transcripts are Hindi ASR auto-captions; extraction is literal keyword
  matching unless an AI key is added. "Candidate rules" are verbatim excerpts
  needing human review — the app never invents executable rules.
- Backtests on one symbol produce few trades; metrics are statistically weak.
- A stop-loss is not a guaranteed exit (gaps, slippage).
- Historical results do not predict future profitability.

See `DECISIONS.md` for engineering decisions per phase.
