import { PrismaClient } from '@prisma/client';

const buildDatabaseUrl = (): string => {
  const base = process.env['DATABASE_URL'] ?? '';
  if (!base) return base;
  try {
    const url = new URL(base);
    url.searchParams.set('connection_limit', '20');
    url.searchParams.set('pool_timeout', '10');
    url.searchParams.set('connect_timeout', '10');
    url.searchParams.set('statement_cache_size', '0');
    return url.toString();
  } catch {
    return base;
  }
};

export const prisma = new PrismaClient({
  datasources: {
    db: { url: buildDatabaseUrl() },
  },
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});
