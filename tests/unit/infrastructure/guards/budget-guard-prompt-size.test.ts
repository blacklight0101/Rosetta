import { describe, expect, it } from 'vitest';
import type {
  LlmAttemptObserver,
  LlmProvider,
} from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { ProviderCallError } from '../../../../src/infrastructure/providers/provider-call-error.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';

// RF-401, RF-428, DEC-155: the cost ledger records an Ollama call refused for its prompt size as
// no call, and a call whose prompt Ollama cut with the tokens Ollama reported.

const failure = { code: ERROR_CODES.ollamaPromptTooLarge };

/** An inner provider that starts an attempt, as the Ollama adapter does, then fails. */
function failing(error: ProviderCallError): LlmProvider {
  return {
    complete: (_request, observer?: LlmAttemptObserver) => {
      observer?.attemptStarted();
      return Promise.reject(error);
    },
  };
}

describe('BudgetGuard with an Ollama prompt size failure', () => {
  it('RF-428 DEC-155 a call refused before it was sent writes no ledger row and frees its reservation', async () => {
    const worstCase = BigInt(estimateInputTokens(budgetRequest())) + 512n * 2n;
    const h = budgetHarness({
      inner: failing(new ProviderCallError(failure, { notSent: true })),
      caps: [{ kind: 'run-cost', limit: worstCase }],
    });

    const first = await failureOf(h.guard.complete(budgetRequest(1)));
    const second = await failureOf(h.guard.complete(budgetRequest(2)));

    expect(first).toBeInstanceOf(ProviderCallError);
    expect(second).toBeInstanceOf(ProviderCallError);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([]);
    expect(h.costs).toEqual([]);
  });

  it('RF-428 DEC-155 a call whose prompt Ollama cut is one ledger row with the reported tokens', async () => {
    const usage = {
      inputTokens: 900,
      outputTokens: 80,
      cachedInputTokens: 0,
      usageSource: 'reported',
    } as const;
    const h = budgetHarness({ inner: failing(new ProviderCallError(failure, { usage })) });

    const error = await failureOf(h.guard.complete(budgetRequest()));

    expect(error).toBeInstanceOf(ProviderCallError);
    const entries = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      attempt: 1,
      inputTokens: 900,
      outputTokens: 80,
      usageSource: 'reported',
      costMicros: 1060n,
    });
    expect(h.costs).toEqual([
      { inputTokens: 900, outputTokens: 80, cachedInputTokens: 0, costMicros: 1060n },
    ]);
  });
});
