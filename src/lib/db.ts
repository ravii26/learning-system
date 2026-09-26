import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const db = (globalForPrisma.prisma ||
  new PrismaClient({
    // Vercel's Postgres integrations may only set POSTGRES_URL.
    datasourceUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })) as PrismaClient & {
    generatedLesson: any;
  };

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db as any;
