import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { observedHarness, slowProvider, textAnswer } from '../../../support/observed-harness.js';

// RF-402, RF-408, RF-421, RF-428, Q-58, P3-86: the reasoning tokens a provider reports are part of
// the output tokens, so the ledger and the cost count them as output; the call log keeps them
// apart as `reasoningTokens`, a part of `outputTokens`, left out when the provider reported none.

const reasoning = {
  ...textAnswer,
  text: '',
  finishReason: 'length' as const,
  usage: {
    inputTokens: 3200,
    outputTokens: 4096,
    cachedInputTokens: 0,
    reasoningTokens: 4096,
    usageSource: 'reported' as const,
  },
};

describe('reasoning tokens in the ledger', () => {
  it('RF-428 the ledger row counts them as output tokens and prices them as output', async () => {
    const h = budgetHarness({ recording: recordingOf({ response: reasoning, retried: [] }) });

    await h.guard.complete(budgetRequest(1, { maxOutputTokens: 4096 }));

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entry?.outputTokens).toBe(4096);
    // The contract price: 1 USD per million input tokens, 2 USD per million output tokens.
    expect(entry?.costMicros).toBe(BigInt(3200 + 4096 * 2));
  });

  it('RF-421 an answer with reasoning tokens still adds up in the run totals', async () => {
    const h = budgetHarness({
      recording: recordingOf({ response: reasoning, retried: [] }),
    });

    await h.guard.complete(budgetRequest(1, { maxOutputTokens: 4096 }));

    expect(h.costs.map((call) => call.outputTokens)).toEqual([4096]);
  });
});

describe('reasoning tokens in the call log', () => {
  it('RF-408 the record keeps them apart from the output tokens', async () => {
    const { provider, log } = observedHarness({
      inner: (clock) => slowProvider(clock, 1500, reasoning),
    });

    await provider.complete(contractRequest());

    expect(log.records()).toEqual([
      expect.objectContaining({ outputTokens: 4096, reasoningTokens: 4096 }),
    ]);
  });

  it('RF-408 the record leaves them out when the provider reported none', async () => {
    const { provider, log } = observedHarness({
      inner: (clock) => slowProvider(clock, 1500, textAnswer),
    });

    await provider.complete(contractRequest());

    expect(log.records()[0]).not.toHaveProperty('reasoningTokens');
  });
});
