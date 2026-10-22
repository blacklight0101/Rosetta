import { describe, expect, it } from 'vitest';
import type { ReservationKey } from '../../../../src/application/ports/cost-ledger.js';
import type { LlmProvider, TokenUsage } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { MemoryCostLedger } from '../../../../src/infrastructure/db/memory-cost-ledger.js';
import { ProviderCallError } from '../../../../src/infrastructure/providers/provider-call-error.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';

// RF-421, RF-428, ADR-007, Q-60: a call whose earlier attempt timed out and was metered is a ledger
// row even when its last attempt was never sent; the booked earlier attempts count against the caps.

const timedOut: TokenUsage = {
  inputTokens: 5000,
  outputTokens: 0,
  cachedInputTokens: 0,
  usageSource: 'estimated',
  outputUnknown: true,
};
const timeout = { code: ERROR_CODES.providerTimeout };
const notSent = new ProviderCallError({ code: ERROR_CODES.providerCallFailed }, { notSent: true });

/** A provider whose first attempt times out and is retried, and whose next is never sent. */
const timingOutThenNotSent: LlmProvider = {
  complete: async (_request, observer) => {
    observer?.attemptStarted();
    await observer?.attemptRetried({ ...timeout, usage: timedOut });
    observer?.attemptStarted();
    throw notSent;
  },
};

/** A provider whose only attempt is never sent. */
const neverSent: LlmProvider = {
  complete: (_request, observer) => {
    observer?.attemptStarted();
    return Promise.reject(notSent);
  },
};

/** The memory ledger, with the reservations the guard freed kept in `released`. */
function watchedLedger(): { ledger: MemoryCostLedger; released: ReservationKey[] } {
  const released: ReservationKey[] = [];
  const ledger = new MemoryCostLedger();
  const release = ledger.release.bind(ledger);
  ledger.release = (key) => {
    released.push(key);
    return release(key);
  };
  return { ledger, released };
}

describe('BudgetGuard with an attempt that was not sent', () => {
  it('RF-428 books the metered earlier attempt when the last attempt was not sent', async () => {
    const { ledger, released } = watchedLedger();
    const h = budgetHarness({ inner: timingOutThenNotSent, ledger });

    expect(await failureOf(h.guard.complete(budgetRequest(1)))).toBe(notSent);

    const entries = await ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entries).toEqual([
      expect.objectContaining({
        attempt: 2,
        inputTokens: 5000,
        outputTokens: 0,
        usageSource: 'estimated',
        costMicros: 5000n,
      }),
    ]);
    expect(h.costs).toEqual([expect.objectContaining({ inputTokens: 5000, costMicros: 5000n })]);
    expect(released).toEqual([]);
  });

  it('RF-428 frees the reservation of a call whose first attempt was not sent and metered nothing', async () => {
    const { ledger, released } = watchedLedger();
    const h = budgetHarness({ inner: neverSent, ledger });

    expect(await failureOf(h.guard.complete(budgetRequest(1)))).toBe(notSent);

    expect(await ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([]);
    expect(h.costs).toEqual([]);
    expect(released).toEqual([
      expect.objectContaining({ callId: budgetRequest(1).context.callId, runId: budgetRun.id }),
    ]);
  });
});

/** A provider whose first attempt times out and is retried, and whose second answers. */
const timingOutThenAnswering: LlmProvider = {
  complete: async (_request, observer) => {
    observer?.attemptStarted();
    await observer?.attemptRetried({ ...timeout, usage: timedOut });
    observer?.attemptStarted();
    return {
      text: 'done',
      modelVersion: 'contract-model',
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'stop',
    };
  },
};

describe('BudgetGuard caps after a retried attempt', () => {
  it('RF-422 refuses the next call once the booked retried attempt passes the run token cap', async () => {
    const request = budgetRequest(1);
    const worstTokens = BigInt(estimateInputTokens(request) + (request.maxOutputTokens ?? 0));
    // Room for two worst cases: the answer alone (110 tokens) would leave the next call room,
    // the timed-out attempt booked with it (5110 tokens) does not.
    const h = budgetHarness({
      inner: timingOutThenAnswering,
      caps: [{ kind: 'run-tokens', limit: 2n * worstTokens + 200n }],
    });

    await h.guard.complete(request);
    const refused = await failureOf(h.guard.complete(budgetRequest(2)));

    expect(refused).toBeInstanceOf(RosettaError);
    expect(refused instanceof RosettaError ? refused.code : undefined).toBe(
      ERROR_CODES.budgetCapReached,
    );
    expect(h.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
  });
});
