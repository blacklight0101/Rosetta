import { describe, expect, it } from 'vitest';
import type {
  LlmAttemptFailure,
  LlmAttemptObserver,
  TokenUsage,
} from '../../../../src/application/ports/llm-provider.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import {
  budgetHarness,
  budgetRequest,
  budgetRun,
  contractPrice,
} from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import { useFakeOllama } from '../../../support/ollama-harness.js';
import { useFakeCompatible } from '../../../support/openai-compatible-harness.js';

// RF-421, RF-422, RF-428, ADR-007, Q-60: a timed-out attempt on Ollama or an OpenAI-compatible
// service may have been generated (and, for the service, billed), so it is metered as on OpenAI and
// Anthropic: the input estimated from the request, the output unknown, booked through the budget
// guard to the ledger row and the run totals. A local model costs $0 but its tokens count against
// the token cap. Fake servers on loopback replay hand-written recordings only (ADR-008).

const startOllama = useFakeOllama();
const { replay } = useFakeCompatible();

/** What a timed-out attempt of the budget request is metered with. */
const timedOut: TokenUsage = {
  inputTokens: estimateInputTokens(budgetRequest(1)),
  outputTokens: 0,
  cachedInputTokens: 0,
  usageSource: 'estimated',
  outputUnknown: true,
};
const estimated = timedOut.inputTokens;

/** The most one budget request can use: its estimated prompt and its output limit (512). */
const worstTokens = estimated + 512;

class Attempts implements LlmAttemptObserver {
  readonly retried: LlmAttemptFailure[] = [];

  attemptStarted(): void {
    // Only the retried attempts matter here.
  }

  attemptRetried(failure: LlmAttemptFailure): Promise<void> {
    this.retried.push(failure);
    return Promise.resolve();
  }
}

describe('a timed-out Ollama attempt', () => {
  it('RF-421 is retried with its input estimated and its output unknown', async () => {
    const { provider } = await startOllama('timeout-then-text', { timeoutSeconds: 0.2 });
    const attempts = new Attempts();

    await provider.complete(budgetRequest(1), attempts);

    expect(attempts.retried).toEqual([{ code: ERROR_CODES.providerTimeout, usage: timedOut }]);
  });

  it('RF-428 is booked with the answer of the retry, at $0 for the local model', async () => {
    const { provider } = await startOllama('timeout-then-text', { timeoutSeconds: 0.2 });
    const h = budgetHarness({ kind: 'ollama', keySource: 'none', inner: provider });

    await h.guard.complete(budgetRequest(1));

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    // The recorded answer reports 1200 input and 80 output tokens.
    expect(entry).toMatchObject({
      inputTokens: estimated + 1200,
      outputTokens: 80,
      attempt: 2,
      usageSource: 'estimated',
      costMicros: 0n,
    });
    expect(h.costs).toEqual([
      expect.objectContaining({ inputTokens: estimated + 1200, outputTokens: 80, costMicros: 0n }),
    ]);
  });

  it('RF-422 counts against the run token cap', async () => {
    const { provider } = await startOllama('timeout-then-text', { timeoutSeconds: 0.2 });
    // Room for the answered attempt (1280 tokens) and one more call, not for the timed-out attempt.
    const caps = [{ kind: 'run-tokens' as const, limit: BigInt(1280 + worstTokens) }];
    const h = budgetHarness({ kind: 'ollama', keySource: 'none', inner: provider, caps });

    await h.guard.complete(budgetRequest(1));

    const refused = await failureOf(h.guard.complete(budgetRequest(2)));
    expect(refused).toMatchObject({ code: ERROR_CODES.budgetCapReached });
  });
});

/** The contract model's price for the OpenAI-compatible kind: 1 USD per million input tokens. */
const compatibleTable: PriceTable = {
  version: '2026-10-11',
  currency: 'USD',
  prices: [{ ...contractPrice, provider: 'openai-compatible' }],
};

describe('a timed-out OpenAI-compatible attempt', () => {
  it('RF-421 is metered on the retry and on the error of the call that timed out twice', async () => {
    const { provider, server } = await replay('timeout-twice', { timeoutSeconds: 0.2 });
    const attempts = new Attempts();

    const error = await failureOf(provider.complete(budgetRequest(1), attempts));

    expect(attempts.retried).toEqual([{ code: ERROR_CODES.providerTimeout, usage: timedOut }]);
    expect(error).toMatchObject({ code: ERROR_CODES.providerTimeout, usage: timedOut });
    expect(server.received).toHaveLength(2);
  });
});

describe('a timed-out OpenAI-compatible call in the budget guard', () => {
  it('RF-428 books both timed-out attempts, estimated and priced', async () => {
    const { provider } = await replay('timeout-twice', { timeoutSeconds: 0.2 });
    const h = budgetHarness({
      kind: 'openai-compatible',
      keySource: 'user',
      table: compatibleTable,
      inner: provider,
    });

    await failureOf(h.guard.complete(budgetRequest(1)));

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entry).toMatchObject({
      inputTokens: 2 * estimated,
      outputTokens: 0,
      usageSource: 'estimated',
      costMicros: BigInt(2 * estimated),
    });
    expect(h.costs).toEqual([
      expect.objectContaining({ inputTokens: 2 * estimated, costMicros: BigInt(2 * estimated) }),
    ]);
  });

  it('RF-422 counts against the run cost cap', async () => {
    const { provider } = await replay('timeout-twice', { timeoutSeconds: 0.2 });
    // Room for exactly one call's worst case: its estimated input and 512 output tokens at 2 USD.
    const caps = [{ kind: 'run-cost' as const, limit: BigInt(estimated + 2 * 512) }];
    const h = budgetHarness({
      kind: 'openai-compatible',
      keySource: 'user',
      table: compatibleTable,
      inner: provider,
      caps,
    });

    await failureOf(h.guard.complete(budgetRequest(1)));

    const refused = await failureOf(h.guard.complete(budgetRequest(2)));
    expect(refused).toMatchObject({ code: ERROR_CODES.budgetCapReached });
  });
});
