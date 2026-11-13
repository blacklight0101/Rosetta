import { describe, expect, it } from 'vitest';
import { journeyOf } from '../../../web/src/lib/journey/journey-steps.js';
import { facts, planRun, projectId, source } from './journey-fixtures.js';

// P9-08, RF-1020, EV-107: the strip's total is the journey's spend as the server gives it, and the
// approved line is the journey's approved amount (Continue raises included). The browser adds nothing.

const budget = {
  ...{ approvedMicros: 133_800, remainingMicros: 0, approvedTokens: 0, remainingTokens: 0 },
  spentMicros: 160_600,
};

describe('RF-1020 P9-08 the total so far', () => {
  it('RF-1020 is the spend of the whole journey, not of the source run and the plan only', () => {
    const given = facts({ source: source(), plan: planRun(), budget });

    const view = journeyOf(given, projectId);

    expect(view.totalCostMicros).toBe(160_600);
  });

  it('RF-1020 the approved line reads the raised amount', () => {
    const view = journeyOf(facts({ budget }), projectId);

    expect(view.left).toBe('$0.00 left of $0.1338 approved');
    expect(view.approved?.text).toBe('$0.00 left of $0.1338 approved');
  });

  it('RF-1020 without a journey record the total is the source run and the plan', () => {
    const view = journeyOf(facts({ plan: planRun(), budget: null }), projectId);

    expect(view.totalCostMicros).toBe(430_000);
  });
});
