import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * On Vercel every function instance opens its own Prisma pool, which defaults
 * to several connections. A page that fires many API calls at once spins up
 * several instances, and together they exceed the database's connection cap
 * ("too many connections", P2037/P1001).
 *
 * Through Neon's pooler (a "-pooler" host) the cap is in the thousands, so
 * each instance gets 5 connections: one instance serves many requests at
 * once, and a single connection made every query on it wait in line (a page
 * load took 10-18s). A direct connection keeps the old cap of 1 so it stays
 * under the database's own limit. DB_CONNECTION_LIMIT overrides; a limit
 * already in the URL wins.
 */
export function runtimeDatabaseUrl(raw: string | undefined, serverless: boolean, limit?: string): string | undefined {
  if (!raw || !serverless || !/^postgres(ql)?:\/\//.test(raw)) return raw;
  const url = new URL(raw);
  const pooled = url.hostname.includes('-pooler.');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', limit || (pooled ? '5' : '1'));
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
  return url.toString();
}

export const db = (globalForPrisma.prisma ||
  new PrismaClient({
    // Vercel's Postgres integrations may only set POSTGRES_URL.
    datasourceUrl: runtimeDatabaseUrl(process.env.DATABASE_URL || process.env.POSTGRES_URL, !!process.env.VERCEL, process.env.DB_CONNECTION_LIMIT),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Prisma's defaults (2s to get a connection, 5s to finish) are too tight
    // when the connection is shared: saving a syllabus timed out mid-way
    // ("Transaction not found") and the ticked module was never stored.
    transactionOptions: { maxWait: 15_000, timeout: 20_000 },
  })) as PrismaClient & {
    generatedLesson: any;
  };

// Reuse one client per instance (dev hot reloads, and warm serverless invocations).
globalForPrisma.prisma = db as any;
