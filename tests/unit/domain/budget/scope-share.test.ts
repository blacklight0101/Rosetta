import { describe, expect, it } from 'vitest';
import {
  capsFor,
  READER_SHARE_PERCENT,
  type CapInputs,
} from '../../../../src/domain/budget/budget.js';
import { checkCaps, noSpend } from '../../../../src/domain/budget/usage-cap.js';

// RF-429, P5-18, DEC-112: a reader's share is also of the room the user-day and server-month caps
// have left at run start, when one of them (not the run cost cap) is the smallest remaining.

const inputs: CapInputs = {
  run: { maxCostMicros: 2_000_000n, maxTokens: 50_000_000n },
  server: { runMicros: 5_000_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
  reader: true,
};
const share = BigInt(READER_SHARE_PERCENT);
const scopeShare = (caps: ReturnType<typeof capsFor>) =>
  caps.filter((cap) => cap.kind === 'role-cost');

describe('the reader share of a scope cap', () => {
  it('RF-429 P5-18 the user-day cap binds: a role cost cap at the share of what the day has left', () => {
    const caps = capsFor('server', { ...inputs, scopeSpent: { 'user-day': 200_000n } });

    expect(scopeShare(caps)).toEqual([
      { kind: 'role-cost', limit: (800_000n * share) / 100n, source: 'reserve' },
    ]);
  });

  it('RF-429 P5-18 the server-month cap binds: the share is of its remaining', () => {
    const caps = capsFor('server', {
      ...inputs,
      server: { ...inputs.server, serverMonthMicros: 600_000n },
      scopeSpent: { 'user-day': 0n, 'server-month': 100_000n },
    });

    expect(scopeShare(caps)).toEqual([
      { kind: 'role-cost', limit: (500_000n * share) / 100n, source: 'reserve' },
    ]);
  });

  it('RF-429 P5-18 the smaller of the user-day and server-month remaining binds', () => {
    const caps = capsFor('server', {
      ...inputs,
      scopeSpent: { 'user-day': 0n, 'server-month': 9_900_000n },
    });

    expect(scopeShare(caps)).toEqual([
      { kind: 'role-cost', limit: (100_000n * share) / 100n, source: 'reserve' },
    ]);
  });

  it('RF-429 P5-18 the run cost cap is the smallest: no scope share, as today', () => {
    const caps = capsFor('server', {
      ...inputs,
      run: { ...inputs.run, maxCostMicros: 300_000n },
      scopeSpent: { 'user-day': 0n, 'server-month': 0n },
    });

    expect(scopeShare(caps)).toEqual([]);
  });

  it('RF-429 P5-18 a scope with nothing left gives a zero share, so the readers cannot start', () => {
    const caps = capsFor('server', { ...inputs, scopeSpent: { 'user-day': 1_500_000n } });

    expect(scopeShare(caps)).toEqual([{ kind: 'role-cost', limit: 0n, source: 'reserve' }]);
  });
});

describe('the reader share of a scope cap and the other caps', () => {
  it('RF-429 P5-18 the user own daily cap counts on the user key', () => {
    const caps = capsFor('user', {
      ...inputs,
      account: { dailyCapMicros: null, ownDailyCapMicros: 400_000n },
      scopeSpent: { 'own-day': 100_000n },
    });

    expect(scopeShare(caps)).toEqual([
      { kind: 'role-cost', limit: (300_000n * share) / 100n, source: 'reserve' },
    ]);
  });

  it('RF-429 P5-18 a reader cost cap of its own replaces the scope share', () => {
    const caps = capsFor('server', {
      ...inputs,
      role: { maxCostMicros: 7n },
      scopeSpent: { 'user-day': 0n },
    });

    expect(scopeShare(caps)).toEqual([{ kind: 'role-cost', limit: 7n }]);
  });
});

describe('the scope share and the guard', () => {
  it('RF-429 P5-18 other roles, and runs with no scope spend read, get no scope share', () => {
    const scopeSpent = { 'user-day': 0n };

    expect(scopeShare(capsFor('server', { ...inputs, reader: false, scopeSpent }))).toEqual([]);
    expect(
      scopeShare(capsFor('server', { ...inputs, verifier: true, reader: false, scopeSpent })),
    ).toEqual([]);
    expect(scopeShare(capsFor('server', inputs))).toEqual([]);
  });

  it('DEC-112 the share refuses a reader call past it, and the scope cap itself still refuses past it', () => {
    const caps = capsFor('server', { ...inputs, scopeSpent: { 'user-day': 0n } });
    const limit = (1_000_000n * share) / 100n;

    const pastShare = checkCaps(
      caps,
      { ...noSpend, 'role-cost': limit - 5n },
      { micros: 6n, tokens: 0n },
    );
    const pastDay = checkCaps(
      caps,
      { ...noSpend, 'user-day': 999_995n },
      { micros: 6n, tokens: 0n },
    );

    expect(!pastShare.ok && pastShare.error.kind).toBe('role-cost');
    expect(!pastDay.ok && pastDay.error.kind).toBe('user-day');
  });
});
