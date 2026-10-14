import { describe, expect, it } from 'vitest';
import type { BudgetEvents } from '../../../../src/application/ports/budget-events.js';
import { RunBudgetEvents } from '../../../../src/application/runs/run-budget-events.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { contractScenarios } from '../../../contracts/llm-provider.contract.js';
import { budgetEventEmitter } from '../../../support/budget-event-fixtures.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';

// RF-421, RF-422, P1-96 (fix round 1): a reporter can never hold an answer or a refusal back (the
// guard waits for it a bounded time), and parallel calls refused by one cap give one
// `budget.capReached`; each refused call still stops the run, which is harmless because the run's
// stop aborts one AbortController and a second abort changes nothing (run-queue.ts).

const worstCaseMicros = BigInt(estimateInputTokens(budgetRequest())) + 512n * 2n;
const tooSmall = [{ kind: 'run-cost', limit: worstCaseMicros - 1n }] as const;

const never: BudgetEvents = {
  callRecorded: () => new Promise<void>(() => undefined),
  capReached: () => new Promise<void>(() => undefined),
};

async function codeOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

describe('BudgetGuard with a reporter that never answers', () => {
  it('RF-421 the answer still returns once the report time limit has passed, and the wait is logged', async () => {
    const h = budgetHarness({ budgetEvents: never, reportTimeoutMs: 20 });

    const response = await h.guard.complete(budgetRequest());

    expect(response.text).toBe(contractScenarios.text.response?.text);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toHaveLength(1);
    expect(h.logger.entries.map((entry) => entry.code)).toContain(ERROR_CODES.runEventLogFailed);
  });

  it('RF-422 a refusal is still thrown and the run still stopped', async () => {
    const h = budgetHarness({ caps: tooSmall, budgetEvents: never, reportTimeoutMs: 20 });

    expect(await codeOf(h.guard.complete(budgetRequest()))).toBe(ERROR_CODES.budgetCapReached);

    expect(h.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
  });
});

describe('BudgetGuard parallel refusals', () => {
  it('RF-422 two calls refused at the same time give one budget.capReached and one abort of the run', async () => {
    const events = budgetEventEmitter();
    const zero = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0n };
    const run = new AbortController();
    let aborts = 0;
    run.signal.addEventListener('abort', () => (aborts += 1));
    const h = budgetHarness({
      caps: tooSmall,
      budgetEvents: new RunBudgetEvents({ events, run: zero, project: zero }),
      stopRun: (reason) => {
        run.abort(reason);
      },
    });

    const codes = await Promise.all([
      codeOf(h.guard.complete(budgetRequest(1))),
      codeOf(h.guard.complete(budgetRequest(2))),
    ]);

    expect(codes).toEqual([ERROR_CODES.budgetCapReached, ERROR_CODES.budgetCapReached]);
    expect(events.emitted.filter((each) => each.type === 'budget.capReached')).toHaveLength(1);
    expect(h.stops).toHaveLength(2);
    expect(aborts).toBe(1);
    expect(run.signal.reason).toBe(h.stops[0]);
  });
});
