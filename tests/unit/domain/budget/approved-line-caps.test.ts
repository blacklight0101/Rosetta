import { describe, expect, it } from 'vitest';
import { capsFor, type CapInputs } from '../../../../src/domain/budget/budget.js';

// RF-432, RF-1106, P8-03: the run pauses at the amount its owner approved, but where an administrator
// cap (the run cap, the user's day) is no higher than that amount it is the binding cap and a hard
// stop: Continue could add nothing, and the guard must end the run `CapReached` there.

const inputs: CapInputs = {
  run: { maxCostMicros: 50_000_000n, maxTokens: 5_000_000n },
  server: { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n },
  account: { dailyCapMicros: null, ownDailyCapMicros: null },
};
const runCost = (caps: ReturnType<typeof capsFor>) => caps.find((cap) => cap.kind === 'run-cost');

describe('RF-432 which cap the approved line is', () => {
  it('RF-432 P8-03 an approved amount under every cap is the line the run pauses at', () => {
    const approved = { maxCostMicros: 400_000n, maxTokens: 1_000_000n };

    expect(runCost(capsFor('server', { ...inputs, approved }))).toMatchObject({
      limit: 400_000n,
      source: 'approved',
    });
  });

  it('RF-432 P8-03 an approved amount equal to the administrator run cap is that hard cap', () => {
    const approved = { maxCostMicros: 500_000n, maxTokens: 1_000_000n };

    expect(runCost(capsFor('server', { ...inputs, approved }))).toMatchObject({
      limit: 500_000n,
      source: 'administrator',
    });
  });

  it('RF-432 P8-03 an approved amount equal to the user day cap is not a pause line', () => {
    const wide = { ...inputs, server: { ...inputs.server, runMicros: 5_000_000n } };
    const approved = { maxCostMicros: 1_000_000n, maxTokens: 1_000_000n };

    expect(runCost(capsFor('server', { ...wide, approved }))?.source).not.toBe('approved');
  });
});
