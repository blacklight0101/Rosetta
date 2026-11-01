import { describe, expect, it } from 'vitest';
import { isApprovalPause } from '../../../../src/domain/budget/cap-stop.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetHarness, budgetRequest } from '../../../support/budget-harness.js';

// RF-432, ADR-026: a call that would pass the run's approved amount is refused like any capped call
// (fail closed: it is never made), and the run is stopped with a pause instead of a cap end; a call
// that would pass a hard cap (DEC-112) still ends the run as before.

const worstCaseMicros = BigInt(estimateInputTokens(budgetRequest())) + 512n * 2n;

async function codeOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

describe('BudgetGuard at the approved amount', () => {
  it('RF-432 refuses the call and pauses the run at the approved line', async () => {
    const h = budgetHarness({
      caps: [{ kind: 'run-cost', limit: worstCaseMicros - 1n, source: 'approved' }],
    });

    expect(await codeOf(h.guard.complete(budgetRequest(1)))).toBe(ERROR_CODES.budgetCapReached);

    expect(h.fake.requests).toEqual([]);
    expect(h.stops).toHaveLength(1);
    expect(isApprovalPause(h.stops[0])).toBe(true);
    expect(h.stops[0]?.code).toBe(ERROR_CODES.budgetCapReached);
    expect(h.calls.records()).toEqual([expect.objectContaining({ status: 'refused-by-cap' })]);
  });

  it('DEC-112 a hard cap still ends the run with a plain cap stop', async () => {
    const h = budgetHarness({
      caps: [
        { kind: 'run-cost', limit: worstCaseMicros * 10n, source: 'approved' },
        { kind: 'user-day', limit: worstCaseMicros - 1n, source: 'administrator' },
      ],
    });

    expect(await codeOf(h.guard.complete(budgetRequest(1)))).toBe(ERROR_CODES.budgetCapReached);

    expect(h.stops.map((stop) => isApprovalPause(stop))).toEqual([false]);
  });
});
