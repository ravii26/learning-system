import { describe, expect, it } from 'vitest';
import { runtimeDatabaseUrl } from './db';

describe('runtimeDatabaseUrl', () => {
  const raw = 'postgres://u:p@host:5432/db?sslmode=require';

  it('caps serverless instances at one connection with a longer wait', () => {
    const url = new URL(runtimeDatabaseUrl(raw, true)!);
    expect(url.searchParams.get('connection_limit')).toBe('1');
    expect(url.searchParams.get('pool_timeout')).toBe('20');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('leaves local dev and non-postgres URLs alone', () => {
    expect(runtimeDatabaseUrl(raw, false)).toBe(raw);
    expect(runtimeDatabaseUrl('prisma+postgres://x?api_key=k', true)).toBe('prisma+postgres://x?api_key=k');
    expect(runtimeDatabaseUrl(undefined, true)).toBeUndefined();
  });

  it('respects an explicit limit', () => {
    expect(new URL(runtimeDatabaseUrl(raw, true, '3')!).searchParams.get('connection_limit')).toBe('3');
    expect(new URL(runtimeDatabaseUrl(raw + '&connection_limit=5', true)!).searchParams.get('connection_limit')).toBe('5');
  });
});
