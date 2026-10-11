import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDatabaseHealth } from '../../../../src/infrastructure/db/pg-database-health.js';

// RF-1303: a database that never answers is reported unreachable after 3 seconds.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PgDatabaseHealth timeout', () => {
  it('RF-1303 reports unreachable 3 seconds after a query that never settles', async () => {
    const health = new PgDatabaseHealth({ query: () => new Promise<never>(() => undefined) });
    let result: boolean | undefined;
    const probe = health.isReachable().then((value) => {
      result = value;
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await probe;

    expect(result).toBe(false);
  });
});
