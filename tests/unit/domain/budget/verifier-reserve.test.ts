import { describe, expect, it } from 'vitest';
import {
  capsFor,
  READER_SHARE_PERCENT,
  type CapInputs,
} from '../../../../src/domain/budget/budget.js';
import { checkCaps, noSpend } from '../../../../src/domain/budget/usage-cap.js';

// RF-429, DEC-193 (replaces the fixed verifier share of DEC-166): the verifier of a run may use what
// is left of the run token cap after the readers' spend, minus the summariser's part, so what is
// left after the readers and the verifier still pays for the summariser (merges and overview). No
// fixed share of its own stops it while run cap is left. A verifier with a token cap of its own
// keeps it instead (as before).

const inputs: CapInputs = {
  run: { maxCostMicros: 2_000_000n, maxTokens: 2_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};

/** The summariser's part of the run token cap (DEC-166, DEC-193). */
const SUMMARISER_PERCENT = 10;

/** The part of the run token cap the readers and the verifier share: all but the summariser's. */
const line = (2_000_000n * BigInt(100 - SUMMARISER_PERCENT)) / 100n;

describe('the claim-check reserve of the run cap', () => {
  it('RF-429 the readers share leaves room for the verifier inside the part that is not the summariser', () => {
    expect(READER_SHARE_PERCENT + SUMMARISER_PERCENT).toBeLessThan(100);
  });

  it('RF-429 DEC-193 a verifier without a token cap of its own is held to the run token cap less the summariser part', () => {
    const caps = capsFor('user', { ...inputs, verifier: true });

    expect(caps).toContainEqual({ kind: 'run-tokens', limit: line, source: 'reserve' });
    expect(caps.some((cap) => cap.kind.startsWith('role'))).toBe(false);
  });

  it('RF-429 DEC-193 a verifier at a fifth of the run cap, with run cap left, is not refused', () => {
    const caps = capsFor('none', { ...inputs, verifier: true });
    const fifth = 400_000n;
    const spent = { ...noSpend, 'role-tokens': fifth, 'run-tokens': 1_000_000n };

    expect(checkCaps(caps, spent, { micros: 0n, tokens: 10_000n }).ok).toBe(true);
  });

  it('RF-429 DEC-193 a verifier call that would use the summariser part of the run cap is refused at the reserve', () => {
    const caps = capsFor('none', { ...inputs, verifier: true });
    const spent = { ...noSpend, 'role-tokens': 100n, 'run-tokens': line - 10n };

    const refused = checkCaps(caps, spent, { micros: 0n, tokens: 11n });

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toMatchObject({ kind: 'run-tokens', source: 'reserve' });
  });

  it('RF-429 a verifier with a token cap of its own keeps it and gets no reserve', () => {
    const caps = capsFor('user', { ...inputs, verifier: true, role: { maxTokens: 9_000n } });

    expect(caps.filter((cap) => cap.source === 'reserve')).toEqual([]);
    expect(caps.filter((cap) => cap.kind.startsWith('role'))).toEqual([
      { kind: 'role-tokens', limit: 9_000n },
    ]);
  });

  it('RF-429 a call that is not the verifier and not a reader gets no share and no reserve', () => {
    const caps = capsFor('user', inputs);

    expect(caps.some((cap) => cap.kind.startsWith('role') || cap.source === 'reserve')).toBe(false);
  });
});
