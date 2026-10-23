import { describe, expect, it } from 'vitest';
import {
  capsFor,
  READER_SHARE_PERCENT,
  type CapInputs,
} from '../../../../src/domain/budget/budget.js';
import { checkCaps, noSpend } from '../../../../src/domain/budget/usage-cap.js';

// RF-429 (P3-111, EV-27): the readers of a run stop at a share of the run caps, so what is left
// verifies the claims they wrote. A reader with a cap of its own keeps it instead of the share.

const inputs: CapInputs = {
  run: { maxCostMicros: 2_000_000n, maxTokens: 2_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};
const share = BigInt(READER_SHARE_PERCENT);

describe('the reader share of the run caps', () => {
  it('RF-429 a reader without a token cap of its own gets a role token cap at the share of the run token cap', () => {
    const caps = capsFor('user', { ...inputs, reader: true });

    expect(caps).toContainEqual({
      kind: 'role-tokens',
      limit: (2_000_000n * share) / 100n,
      source: 'reserve',
    });
    expect(caps.some((cap) => cap.kind === 'role-cost')).toBe(false);
  });

  it('RF-429 the share is a share of tokens on every key source and never of the cost cap', () => {
    const caps = capsFor('server', { ...inputs, reader: true });

    expect(caps).toContainEqual({
      kind: 'role-tokens',
      limit: (2_000_000n * share) / 100n,
      source: 'reserve',
    });
  });
});

describe('the reader share and the caps a reader has', () => {
  it('RF-429 a reader with a cap of its own keeps it and gets no share', () => {
    const role = { maxTokens: 9_000n };

    const caps = capsFor('user', { ...inputs, reader: true, role });

    expect(caps.filter((cap) => cap.kind.startsWith('role'))).toEqual([
      { kind: 'role-tokens', limit: 9_000n },
    ]);
  });

  it('RF-429 a reader with only a cost cap of its own still gets the token share', () => {
    const caps = capsFor('user', { ...inputs, reader: true, role: { maxCostMicros: 5n } });

    expect(caps).toContainEqual({ kind: 'role-cost', limit: 5n });
    expect(caps).toContainEqual({
      kind: 'role-tokens',
      limit: (2_000_000n * share) / 100n,
      source: 'reserve',
    });
  });

  it('RF-429 other roles and calls not marked as a reader get no share', () => {
    expect(capsFor('user', inputs).some((cap) => cap.kind.startsWith('role'))).toBe(false);
  });

  it('RF-429 the share refuses a reader call that would use the part kept for verifying', () => {
    const caps = capsFor('none', { ...inputs, reader: true });
    const limit = (2_000_000n * share) / 100n;
    const spent = { ...noSpend, 'role-tokens': limit - 10n };

    const refused = checkCaps(caps, spent, { micros: 0n, tokens: 11n });

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.kind).toBe('role-tokens');
  });
});
