import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";

function createClient() {
  // Supabase: DATABASE_URL should be the transaction pooler (port 6543,
  // `?pgbouncer=true`) so serverless functions on Vercel don't exhaust
  // Postgres connections. Keep the pool tiny per function instance.
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

// Singleton across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
