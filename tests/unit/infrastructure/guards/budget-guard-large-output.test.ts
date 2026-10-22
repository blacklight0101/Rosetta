import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetHarness, budgetRequest } from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';

// RF-402, RF-420, Q-58, P3-100: the empty-answer retry may ask for up to 128,000 output tokens; the
// guard reserves the worst case of that call (the whole output limit, at the output price) and
// refuses it cleanly when the cap cannot hold it.

describe('BudgetGuard with a large output limit', () => {
  it('RF-420 P3-100 refuses a call whose worst case at 128,000 output tokens passes the cap', async () => {
    const input = BigInt(estimateInputTokens(budgetRequest()));
    // The contract model costs 1 micro per input token and 2 per output token.
    const h = budgetHarness({ caps: [{ kind: 'run-cost', limit: input + 64_000n * 2n }] });

    const refused = await failureOf(
      h.guard.complete(budgetRequest(1, { maxOutputTokens: 128_000 })),
    );

    expect(refused).toMatchObject({ code: ERROR_CODES.budgetCapReached });
    expect(h.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
    expect(h.costs).toEqual([]);
  });

  it('RF-420 P3-100 lets the same cap hold a call at 64,000 output tokens', async () => {
    const input = BigInt(estimateInputTokens(budgetRequest()));
    const h = budgetHarness({ caps: [{ kind: 'run-cost', limit: input + 64_000n * 2n }] });

    const response = await h.guard.complete(budgetRequest(1, { maxOutputTokens: 64_000 }));

    expect(response.text).not.toBe('');
    expect(h.stops).toEqual([]);
  });
});
