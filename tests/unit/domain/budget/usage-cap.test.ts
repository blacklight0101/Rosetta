import { describe, expect, it } from 'vitest';
import { capsFor, type CapInputs } from '../../../../src/domain/budget/budget.js';
import { isCapStop } from '../../../../src/domain/budget/cap-stop.js';
import {
  checkCaps,
  noSpend,
  type CapSpent,
  type UsageCap,
} from '../../../../src/domain/budget/usage-cap.js';
import { utcPeriodsOf } from '../../../../src/domain/budget/utc-periods.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';

// RF-422, RF-1106, DEC-107, ADR-007: which caps a call is checked against, and the check of its
// worst case against what is already spent or reserved.

const inputs: CapInputs = {
  run: { maxCostMicros: 2_000_000n, maxTokens: 2_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};

describe('caps of a call (DEC-107)', () => {
  it('RF-422 with server keys the run cap is the lower of the run and the administrator cap', () => {
    expect(capsFor('server', inputs)).toEqual([
      { kind: 'run-cost', limit: 500_000n, source: 'administrator' },
      { kind: 'run-tokens', limit: 2_000_000n },
      { kind: 'user-day', limit: 1_000_000n, source: 'administrator' },
      { kind: 'server-month', limit: 10_000_000n, source: 'administrator' },
    ]);
    const lowRun = { ...inputs, run: { maxCostMicros: 100_000n, maxTokens: 5n } };
    expect(capsFor('server', lowRun)[0]).toEqual({
      kind: 'run-cost',
      limit: 100_000n,
      source: 'project',
    });
  });

  it('RF-1106 with server keys an account daily cap set by the administrator replaces the default', () => {
    const account = { dailyCapMicros: 250_000n, ownDailyCapMicros: null };

    expect(capsFor('server', { ...inputs, account })).toContainEqual({
      kind: 'user-day',
      source: 'account',
      limit: 250_000n,
    });
  });

  it('RF-1106 with the user own keys only the run caps and the own daily cap apply', () => {
    expect(capsFor('user', inputs)).toEqual([
      { kind: 'run-cost', limit: 2_000_000n, source: 'project' },
      { kind: 'run-tokens', limit: 2_000_000n },
    ]);
    const account = { dailyCapMicros: 1n, ownDailyCapMicros: 300_000n };
    expect(capsFor('user', { ...inputs, account })).toEqual([
      { kind: 'run-cost', limit: 2_000_000n, source: 'project' },
      { kind: 'run-tokens', limit: 2_000_000n },
      { kind: 'own-day', limit: 300_000n },
    ]);
  });

  it('RF-422 a local model without a key is still under the run caps', () => {
    expect(capsFor('none', inputs).map((cap) => cap.kind)).toEqual(['run-cost', 'run-tokens']);
  });
});

describe('cap check', () => {
  const caps: readonly UsageCap[] = [
    { kind: 'run-cost', limit: 1_000n },
    { kind: 'run-tokens', limit: 500n },
  ];
  const spent: CapSpent = { ...noSpend, 'run-cost': 900n, 'run-tokens': 100n };

  it('RF-422 lets a call through whose worst case stays inside every cap', () => {
    expect(checkCaps(caps, spent, { micros: 100n, tokens: 400n })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('RF-422 refuses a call whose worst case would pass the cost cap, naming the cap', () => {
    expect(checkCaps(caps, spent, { micros: 101n, tokens: 1n })).toEqual({
      ok: false,
      error: { kind: 'run-cost', limit: 1_000n, spent: 900n, needed: 101n },
    });
  });

  it('RF-422 refuses a call whose worst case would pass the token cap', () => {
    const result = checkCaps(caps, spent, { micros: 0n, tokens: 401n });

    expect(result.ok ? undefined : result.error.kind).toBe('run-tokens');
  });

  it('RF-422 refuses every call once a cap is already passed', () => {
    const over: CapSpent = { ...spent, 'run-cost': 1_200n };

    expect(checkCaps(caps, over, { micros: 0n, tokens: 0n }).ok).toBe(false);
  });

  it('RF-422 a cap of zero refuses any call that could cost something', () => {
    const zero: readonly UsageCap[] = [{ kind: 'run-cost', limit: 0n }];

    expect(checkCaps(zero, noSpend, { micros: 1n, tokens: 1n }).ok).toBe(false);
    expect(checkCaps(zero, noSpend, { micros: 0n, tokens: 1n }).ok).toBe(true);
  });
});

describe('UTC periods (DEC-107)', () => {
  it('RF-1106 the day and the month are UTC calendar periods', () => {
    const periods = utcPeriodsOf(new Date('2026-10-31T23:59:59.999-02:00'));

    expect(periods).toEqual({
      dayStart: Date.parse('2026-11-01T00:00:00.000Z'),
      dayEnd: Date.parse('2026-11-02T00:00:00.000Z'),
      monthStart: Date.parse('2026-11-01T00:00:00.000Z'),
      monthEnd: Date.parse('2026-12-01T00:00:00.000Z'),
    });
  });

  it('RF-1106 December rolls over into January of the next year', () => {
    const periods = utcPeriodsOf(new Date('2026-12-31T12:00:00.000Z'));

    expect(periods.dayEnd).toBe(Date.parse('2027-01-01T00:00:00.000Z'));
    expect(periods.monthEnd).toBe(Date.parse('2027-01-01T00:00:00.000Z'));
  });
});

describe('cap stop', () => {
  it('RF-422 tells a cap refusal apart from any other stop', () => {
    expect(isCapStop(new RosettaError(ERROR_CODES.budgetCapReached))).toBe(true);
    expect(isCapStop(new RosettaError(ERROR_CODES.providerCallCancelled))).toBe(false);
    expect(isCapStop(undefined)).toBe(false);
  });
});
