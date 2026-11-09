/**
 * Prisma client singleton.
 *
 * Prisma 7 dropped the bundled query engine, so the client is constructed with
 * an explicit driver adapter — node-postgres here. That also means connection
 * pooling is ours to configure: see `max` below.
 *
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * pool on every edit until Postgres refuses connections. Stashing the client on
 * globalThis keeps exactly one pool per process.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Serverless hosts run many short-lived instances against one database, so
    // keep each pool small. Raise this for a long-running single-process deploy.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
