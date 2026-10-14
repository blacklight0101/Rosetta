import { describe, expect, it } from 'vitest';
import type { BudgetEvents } from '../../../../src/application/ports/budget-events.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { contractScenarios } from '../../../contracts/llm-provider.contract.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';
import { recordingOf } from '../../../support/fake-recordings.js';

// RF-421, RF-422, RF-1003, ADR-007, P1-96: the budget guard reports every recorded call and every
// cap stop to the run's budget events, and a reporter that fails never changes what the guard
// decided: the answer still returns, a refused call is still refused and the run still stops.

const worstCaseMicros = BigInt(estimateInputTokens(budgetRequest())) + 512n * 2n;
const tooSmall = [{ kind: 'run-cost', limit: worstCaseMicros - 1n }] as const;

async function codeOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

const throwing: BudgetEvents = {
  callRecorded: () => Promise.reject(new RosettaError(ERROR_CODES.runEventRefused)),
  capReached: () => Promise.reject(new Error('the event log is gone')),
};

describe('BudgetGuard budget events', () => {
  it('RF-1003 reports each answered call with its ledger row and the caps that applied', async () => {
    const caps = [{ kind: 'run-cost', limit: 1_000_000n }] as const;
    const h = budgetHarness({ caps });

    await h.guard.complete(budgetRequest(1));
    await h.guard.complete(budgetRequest(2));

    const rows = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(h.reported.calls).toEqual([
      { entry: rows[0], caps },
      { entry: rows[1], caps },
    ]);
    expect(h.reported.caps).toEqual([]);
  });

  it('RF-1003 a call that failed at the provider reports no usage', async () => {
    const h = budgetHarness({ recording: recordingOf(contractScenarios['permanent-failure']) });

    await codeOf(h.guard.complete(budgetRequest()));

    expect(h.reported.calls).toEqual([]);
  });

  it('RF-422 reports the cap that refused a call, once', async () => {
    const h = budgetHarness({ caps: tooSmall });

    await codeOf(h.guard.complete(budgetRequest()));

    expect(h.reported.caps).toEqual([
      { kind: 'run-cost', limit: worstCaseMicros - 1n, spent: 0n, needed: worstCaseMicros },
    ]);
    expect(h.reported.calls).toEqual([]);
  });
});

describe('BudgetGuard with failing budget events', () => {
  it('RF-421 a throwing reporter does not fail the call: the answer and its ledger row stay', async () => {
    const h = budgetHarness({ budgetEvents: throwing });

    const response = await h.guard.complete(budgetRequest());

    expect(response.text).toBe(contractScenarios.text.response?.text);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toHaveLength(1);
    expect(h.costs).toHaveLength(1);
    expect(h.logger.entries.map((entry) => entry.code)).toContain(ERROR_CODES.runEventRefused);
  });

  it('RF-422 a throwing reporter does not change a refusal: not made, run stopped, refusal thrown', async () => {
    const h = budgetHarness({ caps: tooSmall, budgetEvents: throwing });

    expect(await codeOf(h.guard.complete(budgetRequest()))).toBe(ERROR_CODES.budgetCapReached);

    expect(h.fake.requests).toHaveLength(0);
    expect(h.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([]);
  });
});
