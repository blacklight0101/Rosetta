import { describe, expect, it } from 'vitest';
import {
  approvedJourneyOf,
  continuedAmount,
} from '../../../../src/application/runs/approved-journey.js';
import {
  MAX_RUN_COST_MICROS,
  MAX_RUN_TOKENS,
} from '../../../../src/application/projects/project-settings.js';
import type { ApprovedAmount } from '../../../../src/domain/budget/approved-amount.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';

// RF-432, ADR-026: the server sets the approved amount from its own journey estimate; the figure the
// browser showed is a confirmation only. Continue never adds more than the offered N, and no amount
// passes the administrator's run ceilings, whatever a crafted request says.

const journey = {
  likely: { tokens: 1_000_000, costMicros: 2_000_000 },
  worstCase: { tokens: 1_500_000, costMicros: 3_000_000 },
};
const huge = { tokens: Number.MAX_SAFE_INTEGER, costMicros: Number.MAX_SAFE_INTEGER };
const ceilings = { tokens: MAX_RUN_TOKENS, costMicros: MAX_RUN_COST_MICROS };

describe('RF-432 the approved amount at the start', () => {
  it('RF-432 records the server figures and its worst case less likely as the remainder', () => {
    expect(approvedJourneyOf({ tokens: 1_010_000, costMicros: 2_030_000 }, journey)).toEqual({
      ok: true,
      value: { ...journey.likely, remainder: { tokens: 500_000, costMicros: 1_000_000 } },
    });
  });

  it('RF-432 refuses a shown figure that is not the server estimate, or no estimate (RST-2310)', () => {
    const refused = { ok: false, error: ERROR_CODES.approvalChanged };

    expect(approvedJourneyOf(huge, journey)).toEqual(refused);
    expect(approvedJourneyOf({ tokens: 1_100_000, costMicros: 2_000_000 }, journey)).toEqual(
      refused,
    );
    expect(approvedJourneyOf(journey.likely, undefined)).toEqual(refused);
  });

  it('RF-432 holds a server estimate above the ceilings at the ceilings', () => {
    const big = { likely: huge, worstCase: huge };

    expect(approvedJourneyOf(huge, big)).toEqual({
      ok: true,
      value: { ...ceilings, remainder: { tokens: 0, costMicros: 0 } },
    });
  });
});

describe('RF-432 Continue (+N) on the server', () => {
  const approved = { ...journey.likely, remainder: { tokens: 500_000, costMicros: 1_000_000 } };

  it('RF-432 a huge N adds only the offered remainder', () => {
    expect(continuedAmount(approved, huge)).toEqual({
      tokens: 1_500_000,
      costMicros: 3_000_000,
      remainder: approved.remainder,
    });
  });

  it('RF-432 repeated Continue never lifts the run past the administrator ceilings', () => {
    let amount: ApprovedAmount = {
      ...approved,
      remainder: { tokens: 40_000_000, costMicros: 90_000_000 },
    };
    for (let i = 0; i < 5; i += 1) amount = continuedAmount(amount, huge);

    expect({ tokens: amount.tokens, costMicros: amount.costMicros }).toEqual(ceilings);
  });
});
