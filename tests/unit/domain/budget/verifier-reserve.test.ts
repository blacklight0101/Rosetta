import { describe, expect, it } from 'vitest';
import {
  capsFor,
  READER_SHARE_PERCENT,
  VERIFIER_SHARE_PERCENT,
  type CapInputs,
} from '../../../../src/domain/budget/budget.js';
import { checkCaps, noSpend } from '../../../../src/domain/budget/usage-cap.js';

// RF-429 (P3-121, HB-03): the verifier of a run stops at a share of the run token cap too, so what
// is left after the readers and the verifier still pays for the summariser (merges and overview). A
// verifier with a cap of its own keeps it instead of the share.

const inputs: CapInputs = {
  run: { maxCostMicros: 2_000_000n, maxTokens: 2_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};

describe('the verifier share of the run caps', () => {
  it('RF-429 the readers and the verifier together leave a part of the run token cap to the summariser', () => {
    expect(READER_SHARE_PERCENT + VERIFIER_SHARE_PERCENT).toBeLessThan(100);
  });

  it('RF-429 a verifier without a token cap of its own gets a role token cap at its share of the run token cap', () => {
    const caps = capsFor('user', { ...inputs, verifier: true });

    expect(caps).toContainEqual({
      kind: 'role-tokens',
      limit: (2_000_000n * BigInt(VERIFIER_SHARE_PERCENT)) / 100n,
      source: 'reserve',
    });
    expect(caps.some((cap) => cap.kind === 'role-cost')).toBe(false);
  });

  it('RF-429 a verifier with a token cap of its own keeps it and gets no share', () => {
    const caps = capsFor('user', { ...inputs, verifier: true, role: { maxTokens: 9_000n } });

    expect(caps.filter((cap) => cap.kind.startsWith('role'))).toEqual([
      { kind: 'role-tokens', limit: 9_000n },
    ]);
  });

  it('RF-429 a call that is not the verifier and not a reader gets no share', () => {
    expect(capsFor('user', inputs).some((cap) => cap.kind.startsWith('role'))).toBe(false);
  });

  it('RF-429 the share refuses a verifier call that would use the part kept for the summariser', () => {
    const caps = capsFor('none', { ...inputs, verifier: true });
    const limit = (2_000_000n * BigInt(VERIFIER_SHARE_PERCENT)) / 100n;
    const spent = { ...noSpend, 'role-tokens': limit - 10n };

    const refused = checkCaps(caps, spent, { micros: 0n, tokens: 11n });

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.kind).toBe('role-tokens');
  });
});
