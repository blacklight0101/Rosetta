import { describe, expect, it } from 'vitest';
import { capsFor, type CapInputs } from '../../../../src/domain/budget/budget.js';
import { checkCaps, noSpend, type UsageCap } from '../../../../src/domain/budget/usage-cap.js';

// RF-423, RF-422, ADR-007: a cap per role is an extra cap of the calls of that role. It is added
// to the caps of the key source and never replaces or lifts the run's own caps.

const inputs: CapInputs = {
  run: { maxCostMicros: 2_000_000n, maxTokens: 2_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};

describe('caps of a role', () => {
  it('RF-423 adds a cost cap and a token cap of the role to the caps of every key source', () => {
    const role = { maxCostMicros: 300_000n, maxTokens: 9_000n };

    for (const source of ['server', 'user', 'none'] as const) {
      expect(capsFor(source, { ...inputs, role })).toEqual(
        expect.arrayContaining([
          { kind: 'role-cost', limit: 300_000n },
          { kind: 'role-tokens', limit: 9_000n },
        ]),
      );
    }
  });

  it('RF-423 a role with only one cap gets only that cap, and none leaves the caps as they were', () => {
    const onlyCost = capsFor('user', { ...inputs, role: { maxCostMicros: 5n } });
    const none = capsFor('user', { ...inputs, role: {} });

    expect(onlyCost.filter((cap) => cap.kind.startsWith('role'))).toEqual([
      { kind: 'role-cost', limit: 5n },
    ]);
    expect(none).toEqual(capsFor('user', inputs));
  });

  it('RF-423 role caps above the run caps leave the run caps in force', () => {
    const role = { maxCostMicros: 9_000_000n, maxTokens: 9_000_000n };

    const caps = capsFor('user', { ...inputs, role });

    expect(caps).toContainEqual({ kind: 'run-cost', limit: 2_000_000n, source: 'project' });
    expect(caps).toContainEqual({ kind: 'run-tokens', limit: 2_000_000n });
  });
});

describe('check of a role cap', () => {
  const cost: readonly UsageCap[] = [{ kind: 'role-cost', limit: 1_000n }];
  const tokens: readonly UsageCap[] = [{ kind: 'role-tokens', limit: 500n }];

  it('RF-423 a role cost cap counts the role spend in micro-dollars', () => {
    const spent = { ...noSpend, 'role-cost': 900n };

    expect(checkCaps(cost, spent, { micros: 100n, tokens: 9_999n }).ok).toBe(true);
    expect(checkCaps(cost, spent, { micros: 101n, tokens: 0n })).toEqual({
      ok: false,
      error: { kind: 'role-cost', limit: 1_000n, spent: 900n, needed: 101n },
    });
  });

  it('RF-423 a role token cap counts tokens, not money', () => {
    const spent = { ...noSpend, 'role-tokens': 100n };

    expect(checkCaps(tokens, spent, { micros: 9_999n, tokens: 400n }).ok).toBe(true);
    expect(checkCaps(tokens, spent, { micros: 0n, tokens: 401n }).ok).toBe(false);
  });

  it('RF-423 a role cap of zero refuses every call that needs anything', () => {
    const zero: readonly UsageCap[] = [{ kind: 'role-tokens', limit: 0n }];

    expect(checkCaps(zero, noSpend, { micros: 0n, tokens: 1n }).ok).toBe(false);
    expect(checkCaps(zero, noSpend, { micros: 0n, tokens: 0n }).ok).toBe(true);
  });
});
