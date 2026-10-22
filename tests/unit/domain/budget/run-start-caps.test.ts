import { describe, expect, it } from 'vitest';
import { capsFor, runStartCapsOf, type CapInputs } from '../../../../src/domain/budget/budget.js';
import { checkCaps, noSpend } from '../../../../src/domain/budget/usage-cap.js';

// RF-1106, RF-422, DEC-107: the effective caps a run starts with, and where each comes from (the
// project, the administrator, the account). The probes of card P3-91 are the cases below.

const inputs: CapInputs = {
  run: { maxCostMicros: 5_000_000n, maxTokens: 2_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};

describe('the effective caps of a run', () => {
  it('RF-1106 server key, project $5.00 and administrator $0.50: the administrator run cap applies and is named', () => {
    expect(runStartCapsOf(['server'], inputs)).toEqual({
      keySource: 'server',
      run: { maxCostMicros: 500_000n, source: 'administrator' },
      userDay: { maxCostMicros: 1_000_000n, source: 'administrator' },
    });
  });

  it('RF-1106 server key with the project run cap the lower one: the project is named, not the administrator', () => {
    const lower = { ...inputs, run: { maxCostMicros: 300_000n, maxTokens: 2_000_000n } };

    expect(runStartCapsOf(['server'], lower).run).toEqual({
      maxCostMicros: 300_000n,
      source: 'project',
    });
  });

  it('RF-1106 own key: the project run cap applies, no administrator figure and no day cap from the server', () => {
    expect(runStartCapsOf(['user'], inputs)).toEqual({
      keySource: 'user',
      run: { maxCostMicros: 5_000_000n, source: 'project' },
    });
  });

  it('RF-1106 a local model (no key) takes the project run cap only', () => {
    expect(runStartCapsOf(['none'], inputs)).toEqual({
      keySource: 'none',
      run: { maxCostMicros: 5_000_000n, source: 'project' },
    });
  });

  it('RF-1106 the daily cap set for the account is named as the account, not as the administrator default', () => {
    const own = { ...inputs, account: { dailyCapMicros: 750_000n, ownDailyCapMicros: null } };

    expect(runStartCapsOf(['server'], own).userDay).toEqual({
      maxCostMicros: 750_000n,
      source: 'account',
    });
  });

  it('RF-1106 a run with one server-key role and one own-key role takes the server figures for the run cap', () => {
    expect(runStartCapsOf(['user', 'server'], inputs)).toMatchObject({
      keySource: 'server',
      run: { maxCostMicros: 500_000n, source: 'administrator' },
    });
  });
});

describe('the source of a cap that refuses a call', () => {
  it('RF-422 a refusal names the source of the cap it passed', () => {
    const breach = checkCaps(capsFor('server', inputs), noSpend, {
      micros: 600_000n,
      tokens: 0n,
    });

    expect(breach).toMatchObject({
      ok: false,
      error: { kind: 'run-cost', limit: 500_000n, source: 'administrator' },
    });
  });

  it('RF-1106 the account daily cap refusal names the account', () => {
    const own = { ...inputs, account: { dailyCapMicros: 750_000n, ownDailyCapMicros: null } };
    const breach = checkCaps(
      capsFor('server', own),
      { ...noSpend, 'user-day': 700_000n },
      {
        micros: 100_000n,
        tokens: 0n,
      },
    );

    expect(breach).toMatchObject({
      ok: false,
      error: { kind: 'user-day', limit: 750_000n, source: 'account' },
    });
  });
});
