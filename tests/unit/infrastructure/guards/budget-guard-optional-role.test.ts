import { describe, expect, it } from 'vitest';
import type { AgentRole, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetHarness, budgetRequest } from '../../../support/budget-harness.js';

// RF-422, RF-250, P2-35: a cap refuses the summariser's call like any other, with the refusal and
// its event, but the summariser's step is optional: its refusal does not stop the run, so a run
// whose readers all finished does not end `CapReached` because of the merge.

const worstCaseMicros = BigInt(estimateInputTokens(budgetRequest())) + 512n * 2n;

function requestOf(role: AgentRole, number: number): LlmRequest {
  const base = budgetRequest(number);
  return { ...base, context: { ...base.context, role, callId: `${role}#${String(number)}` } };
}

async function codeOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

describe('BudgetGuard and the optional summariser', () => {
  it('RF-422 a run cap refuses a summariser call and reports it, without stopping the run', async () => {
    const h = budgetHarness({ caps: [{ kind: 'run-cost', limit: worstCaseMicros - 1n }] });

    expect(await codeOf(h.guard.complete(requestOf('summariser', 1)))).toBe(
      ERROR_CODES.budgetCapReached,
    );

    expect(h.fake.requests).toEqual([]);
    expect(h.stops).toEqual([]);
    expect(h.calls.records()).toEqual([expect.objectContaining({ status: 'refused-by-cap' })]);
    expect(h.reported.caps).toEqual([expect.objectContaining({ kind: 'run-cost' })]);
  });

  it('RF-422 the same refusal of a reader call still stops the run', async () => {
    const h = budgetHarness({ caps: [{ kind: 'run-cost', limit: worstCaseMicros - 1n }] });

    expect(await codeOf(h.guard.complete(requestOf('reader', 1)))).toBe(
      ERROR_CODES.budgetCapReached,
    );

    expect(h.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
  });
});
