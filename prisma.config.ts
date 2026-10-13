import "dotenv/config";
import { defineConfig } from "prisma/config";

// The Prisma CLI (migrate / studio) needs a DIRECT connection to Postgres.
// On Supabase that is the "Session" connection string (port 5432), not the
// transaction pooler (port 6543) the app uses at runtime.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL (and ideally DIRECT_URL) must be set — see .env.example",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: { url },
});
