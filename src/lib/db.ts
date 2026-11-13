import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * On Vercel every function instance opens its own Prisma pool, which defaults
 * to several connections. A page that fires many API calls at once spins up
 * several instances, and together they exceed the database's connection cap
 * ("too many connections", P2037/P1001). One connection per instance, with a
 * longer wait for it, keeps the total under the cap: queries queue instead of
 * failing. DB_CONNECTION_LIMIT overrides; a limit already in the URL wins.
 */
export function runtimeDatabaseUrl(raw: string | undefined, serverless: boolean, limit?: string): string | undefined {
  if (!raw || !serverless || !/^postgres(ql)?:\/\//.test(raw)) return raw;
  const url = new URL(raw);
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', limit || '1');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
  return url.toString();
}

export const db = (globalForPrisma.prisma ||
  new PrismaClient({
    // Vercel's Postgres integrations may only set POSTGRES_URL.
    datasourceUrl: runtimeDatabaseUrl(process.env.DATABASE_URL || process.env.POSTGRES_URL, !!process.env.VERCEL, process.env.DB_CONNECTION_LIMIT),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })) as PrismaClient & {
    generatedLesson: any;
  };

// Reuse one client per instance (dev hot reloads, and warm serverless invocations).
globalForPrisma.prisma = db as any;
