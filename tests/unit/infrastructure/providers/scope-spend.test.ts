import { describe, expect, it } from 'vitest';
import type { AccountUsage } from '../../../../src/application/ports/account-usage.js';
import {
  readerRunSpend,
  scopeSpentAt,
  scopeStartOf,
} from '../../../../src/infrastructure/providers/scope-spend.js';
import { MemoryCostLedger } from '../../../../src/infrastructure/db/memory-cost-ledger.js';
import { costEntry } from '../../../support/cost-fixtures.js';

// RF-429, P5-18, DEC-107: what the scope caps and this run's readers have spent when a run's
// providers are built.

const now = new Date('2026-10-12T10:00:00.000Z');
const usage: Pick<AccountUsage, 'userDay' | 'serverMonth'> = {
  userDay: () =>
    Promise.resolve({
      server: [
        { currency: 'EUR', costMicros: 900n },
        { currency: 'USD', costMicros: 11n },
      ],
      own: [{ currency: 'USD', costMicros: 22n }],
    }),
  serverMonth: () =>
    Promise.resolve([
      { currency: 'USD', costMicros: 33n },
      { currency: 'EUR', costMicros: 5n },
    ]),
};
const request = { account: { id: 'u1' }, run: { id: 'r1' } };

describe('scopeSpentAt', () => {
  it('RF-429 P5-18 reads the user day on server keys, on own keys and the server month, in USD only', async () => {
    expect(await scopeSpentAt(usage, 'u1', now)).toEqual({
      'user-day': 11n,
      'own-day': 22n,
      'server-month': 33n,
    });
  });

  it('RF-429 P5-18 asks for the UTC day and month the instant falls in', async () => {
    const asked: number[] = [];
    await scopeSpentAt(
      {
        userDay: (_user, since) => {
          asked.push(since);
          return Promise.resolve({ server: [], own: [] });
        },
        serverMonth: (since) => {
          asked.push(since);
          return Promise.resolve([]);
        },
      },
      'u1',
      now,
    );

    expect(asked).toEqual([Date.UTC(2026, 9, 12), Date.UTC(2026, 9, 1)]);
  });
});

describe('readerRunSpend', () => {
  it('RF-429 P5-18 sums the readers rows of this run only', async () => {
    const ledger = new MemoryCostLedger();
    await ledger.settle(costEntry('u1', { runId: 'r1', role: 'reader', costMicros: 100n }));
    await ledger.settle(costEntry('u1', { runId: 'r1', role: 'reader', costMicros: 50n }));
    await ledger.settle(costEntry('u1', { runId: 'r1', role: 'verifier', costMicros: 7n }));
    await ledger.settle(costEntry('u1', { runId: 'r2', role: 'reader', costMicros: 9n }));
    await ledger.settle(costEntry('u2', { runId: 'r1', role: 'reader', costMicros: 3n }));

    expect(await readerRunSpend(ledger, 'u1', 'r1')).toBe(150n);
  });
});

describe('scopeStartOf', () => {
  const deps = { usage, ledger: new MemoryCostLedger(), clock: { now: () => now } };

  it('RF-429 P5-18 reads nothing for a call that is not a run with a reader', async () => {
    expect(await scopeStartOf(deps, request, false)).toEqual({
      scopeSpent: undefined,
      readerRunMicros: 0n,
    });
    expect(await scopeStartOf({ ledger: deps.ledger, clock: deps.clock }, request, true)).toEqual({
      scopeSpent: undefined,
      readerRunMicros: 0n,
    });
  });

  it('RF-429 P5-18 a run with no id has no earlier reader spend', async () => {
    const start = await scopeStartOf(deps, { ...request, run: { id: null } }, true);

    expect(start.readerRunMicros).toBe(0n);
    expect(start.scopeSpent).toBeDefined();
  });

  it('DEC-112 P5-18 a usage query that fails fails the start, it is not read as zero spend', async () => {
    const broken = {
      ...deps,
      usage: { ...usage, serverMonth: () => Promise.reject(new Error('database is down')) },
    };

    await expect(scopeStartOf(broken, request, true)).rejects.toThrow('database is down');
  });
});
