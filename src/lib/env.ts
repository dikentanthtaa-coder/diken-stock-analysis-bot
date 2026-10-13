import "server-only";
import { z } from "zod";

// Server-side environment. All keys optional except the database —
// the app must stay usable without any external API keys.
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required (Supabase Postgres connection string)")
    .refine((u) => u.startsWith("postgres://") || u.startsWith("postgresql://"), {
      message: "DATABASE_URL must be a postgres:// or postgresql:// URL",
    }),
  MARKET_DATA_PROVIDER: z.string().optional().default(""),
  MARKET_DATA_API_KEY: z.string().optional().default(""),
  AI_PROVIDER: z.string().optional().default(""),
  AI_API_KEY: z.string().optional().default(""),
  YOUTUBE_API_KEY: z.string().optional().default(""),
  TWELVEDATA_API_KEY: z.string().optional().default(""),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  MARKET_DATA_PROVIDER: process.env.MARKET_DATA_PROVIDER,
  MARKET_DATA_API_KEY: process.env.MARKET_DATA_API_KEY,
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  TWELVEDATA_API_KEY: process.env.TWELVEDATA_API_KEY,
});
