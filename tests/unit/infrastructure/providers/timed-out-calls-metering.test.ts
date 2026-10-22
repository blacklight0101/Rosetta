import { describe, expect, it } from 'vitest';
import type { LlmProvider, TokenUsage } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { ProviderCallError } from '../../../../src/infrastructure/providers/provider-call-error.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import { observedHarness } from '../../../support/observed-harness.js';

// RF-408, RF-428, ADR-007, Q-60: a call that timed out may have been generated and billed, so its
// attempts are metered with the input estimated and the output marked unknown, not as 0 tokens and
// $0.00. The call log says so with `outputUnknown`.

const timedOut: TokenUsage = {
  inputTokens: 5000,
  outputTokens: 0,
  cachedInputTokens: 0,
  usageSource: 'estimated',
  outputUnknown: true,
};
const failure = { code: ERROR_CODES.providerTimeout };

/** A provider whose first attempt times out and is retried, and whose second times out for good. */
const timingOutTwice: LlmProvider = {
  complete: async (_request, observer) => {
    observer?.attemptStarted();
    await observer?.attemptRetried({ ...failure, usage: timedOut });
    observer?.attemptStarted();
    throw new ProviderCallError(failure, { usage: timedOut });
  },
};

describe('the call log of a call that timed out', () => {
  it('RF-408 records each timed-out attempt with its estimated input, its cost and an unknown output', async () => {
    const { provider, log } = observedHarness({ inner: () => timingOutTwice });

    await failureOf(provider.complete(contractRequest()));

    const metered = {
      inputTokens: 5000,
      outputTokens: 0,
      usageSource: 'estimated',
      outputUnknown: true,
      costMicros: 1234,
      errorCode: 'RST-1505',
    };
    expect(log.records()).toEqual([
      expect.objectContaining({ ...metered, attempt: 1, status: 'retried' }),
      expect.objectContaining({ ...metered, attempt: 2, status: 'failed' }),
    ]);
  });

  it('RF-408 keeps an attempt that failed otherwise at 0 tokens, without the unknown mark', async () => {
    const other: LlmProvider = {
      complete: () =>
        Promise.reject(new ProviderCallError({ code: ERROR_CODES.providerCallFailed })),
    };
    const { provider, log } = observedHarness({ inner: () => other });

    await failureOf(provider.complete(contractRequest()));

    const [record] = log.records();
    expect(record).toMatchObject({ inputTokens: 0, outputTokens: 0, costMicros: 0 });
    expect(record).not.toHaveProperty('outputUnknown');
  });
});

/** A provider whose first attempt times out and is retried, and whose second answers. */
const timingOutThenAnswering: LlmProvider = {
  complete: async (_request, observer) => {
    observer?.attemptStarted();
    await observer?.attemptRetried({ ...failure, usage: timedOut });
    observer?.attemptStarted();
    return {
      text: 'done',
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'stop',
    };
  },
};

describe('the ledger row of a call that timed out', () => {
  it('RF-428 books every timed-out attempt, estimated and priced, when the call fails for good', async () => {
    const h = budgetHarness({ inner: timingOutTwice });

    await failureOf(h.guard.complete(budgetRequest(1)));

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entry).toMatchObject({ inputTokens: 10000, outputTokens: 0, usageSource: 'estimated' });
    // The contract price: 1 USD per million input tokens.
    expect(entry?.costMicros).toBe(10000n);
    expect(h.costs).toEqual([expect.objectContaining({ inputTokens: 10000, costMicros: 10000n })]);
  });

  it('RF-428 books the timed-out attempt together with the answer of the retry', async () => {
    const h = budgetHarness({ inner: timingOutThenAnswering });

    await h.guard.complete(budgetRequest(1));

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entry).toMatchObject({
      inputTokens: 5100,
      outputTokens: 10,
      attempt: 2,
      usageSource: 'estimated',
    });
    // 5100 input tokens at 1 USD per million, 10 output tokens at 2 USD per million.
    expect(entry?.costMicros).toBe(5120n);
    expect(h.costs).toEqual([
      expect.objectContaining({ inputTokens: 5100, outputTokens: 10, costMicros: 5120n }),
    ]);
  });
});
