import { describe, expect, it } from 'vitest';
import type { DeepenEstimate } from '../../../../src/application/estimate/deepen-estimate.js';
import { deepenEstimateView } from '../../../../src/presentation/web/deepen-routes.js';

// RF-434, P8-24: the answer of POST /api/runs/:runId/deepen/estimate carries the journey's approved
// amount, so the panel can show what is left of it (the e2e run found it missing from the view).

const point = { inputTokens: 1, outputTokens: 2, costMicros: 3n };
const range = { low: point, likely: point, high: point };

function estimate(journey: DeepenEstimate['journey']): DeepenEstimate {
  return {
    ...{ priceTableVersion: 'v', currency: 'USD', maxRounds: 3, coveragePass: true },
    plan: {
      ...{ judge: 0, reread: 0, outOfScope: 0, failedAreas: 0 },
      ...{ answers: 0, unreadFiles: 0, unreadTokens: 0 },
    },
    roles: [],
    round: range,
    allRounds: range,
    cap: { maxCostMicros: 10, maxTokens: 20 },
    overCap: { round: false, allRounds: false },
    ...(journey === undefined ? {} : { journey }),
  };
}

describe('RF-434 the view of a Deepen estimate', () => {
  it('RF-434 carries the approved amount of the journey', () => {
    const journey = {
      ...{ approvedMicros: 4_000_000, remainingMicros: 3_960_000 },
      ...{ approvedTokens: 4_000_000, remainingTokens: 3_940_000 },
    };

    expect(deepenEstimateView(estimate(journey))).toMatchObject({ journey });
  });

  it('RF-434 has no journey for a project without one', () => {
    expect(deepenEstimateView(estimate(undefined))).not.toHaveProperty('journey');
  });
});
