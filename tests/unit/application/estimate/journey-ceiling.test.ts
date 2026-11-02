import { describe, expect, it } from 'vitest';
import {
  approvableOf,
  ceilingsOf,
  type CeilingInputs,
} from '../../../../src/application/estimate/journey-ceiling.js';
import {
  MAX_RUN_COST_MICROS,
  MAX_RUN_TOKENS,
} from '../../../../src/application/projects/project-settings.js';

// RF-430, DEC-206, EV-84: the figure the user approves is the lower of the journey's worst case and
// the administrator ceilings that bind the run: the run cap and the user's day cap on server keys,
// the user's own day cap on an own key, and the run ceilings of 50,000,000 tokens and $100.

const inputs: CeilingInputs = {
  keySources: ['server'],
  server: { runMicros: 4_000_000n, userDayMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};

describe('RF-430 the ceilings that bind a run of the journey', () => {
  it('RF-430 DEC-206 server keys: the administrator run cap of $4 binds, the day cap of $10 is higher', () => {
    expect(ceilingsOf(inputs)).toEqual({ tokens: MAX_RUN_TOKENS, costMicros: 4_000_000n });
  });

  it('RF-430 DEC-206 server keys: a user day cap below the run cap binds', () => {
    const day = { ...inputs, account: { dailyCapMicros: 2_500_000n, ownDailyCapMicros: null } };

    expect(ceilingsOf(day).costMicros).toBe(2_500_000n);
  });

  it('RF-430 DEC-206 an own key: the user own day cap binds, the server caps do not', () => {
    const own = {
      keySources: ['user'] as const,
      server: inputs.server,
      account: { dailyCapMicros: null, ownDailyCapMicros: 1_500_000n },
    };

    expect(ceilingsOf(own).costMicros).toBe(1_500_000n);
  });

  it('RF-430 DEC-206 an own key without a day cap, or a local model: the run ceilings of $100 and 50M tokens', () => {
    const own = { ...inputs, keySources: ['user' as const] };
    const local = { ...inputs, keySources: ['none' as const] };
    const run = { tokens: MAX_RUN_TOKENS, costMicros: BigInt(MAX_RUN_COST_MICROS) };

    expect(ceilingsOf(own)).toEqual(run);
    expect(ceilingsOf(local)).toEqual(run);
  });
});

describe('RF-430 the approvable figure', () => {
  const ceilings = { tokens: MAX_RUN_TOKENS, costMicros: 4_000_000n };

  it('RF-430 DEC-206 EV-84 a worst case of $314.17 and 375.9M tokens is lowered to the ceilings', () => {
    const worst = { tokens: 375_900_000, costMicros: 314_170_000n };

    expect(approvableOf(worst, ceilings)).toEqual({
      approvable: { tokens: MAX_RUN_TOKENS, costMicros: 4_000_000n },
      ceilingApplied: true,
    });
  });

  it('RF-430 DEC-206 a worst case under the ceilings is the figure, and no ceiling is named', () => {
    const worst = { tokens: 1_200_000, costMicros: 1_320_000n };

    expect(approvableOf(worst, ceilings)).toEqual({ approvable: worst, ceilingApplied: false });
  });

  it('RF-430 DEC-206 one dimension over its ceiling is lowered alone', () => {
    const worst = { tokens: 1_200_000, costMicros: 9_000_000n };

    expect(approvableOf(worst, ceilings)).toEqual({
      approvable: { tokens: 1_200_000, costMicros: 4_000_000n },
      ceilingApplied: true,
    });
  });
});
