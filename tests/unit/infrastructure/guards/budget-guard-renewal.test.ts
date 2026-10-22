import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../../src/application/ports/clock.js';
import type { ReservationKey } from '../../../../src/application/ports/cost-ledger.js';
import type { LlmProvider, LlmResponse } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { MemoryCostLedger } from '../../../../src/infrastructure/db/memory-cost-ledger.js';
import { ProviderCallError } from '../../../../src/infrastructure/providers/provider-call-error.js';
import { budgetHarness, budgetInstant, budgetRequest } from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';

// RF-422, ADR-007, P3-99: while a call is in flight the budget guard renews its reservation, every
// half of the reservation's lifetime, to the lifetime from now; when the call ends (answered,
// failed or never sent) the guard stops renewing, waits for a renewal under way, then settles or
// releases the reservation exactly once. A renewal that fails is logged and tried again.

const ttlMs = 180_000;
const timerClock: Clock = { now: () => new Date() };

/** The memory ledger with every settle, release and renewal it was asked for, in order. */
function countingLedger() {
  const ledger = new MemoryCostLedger();
  const calls: string[] = [];
  const renewals: Date[] = [];
  const settle = ledger.settle.bind(ledger);
  const release = ledger.release.bind(ledger);
  const renew = ledger.renew.bind(ledger);
  ledger.settle = (entry) => {
    calls.push('settle');
    return settle(entry);
  };
  ledger.release = (key) => {
    calls.push('release');
    return release(key);
  };
  ledger.renew = (key: ReservationKey, expiresAt: Date) => {
    calls.push('renew');
    renewals.push(expiresAt);
    return renew(key, expiresAt);
  };
  return { ledger, calls, renewals };
}

const answer: LlmResponse = {
  text: 'The Catalog area lists products from the database.',
  toolCalls: [],
  usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
  modelVersion: 'contract-model-2026-08-07',
};

/** A provider whose one attempt answers, or fails with `error`, after `ms`. */
function after(ms: number, error?: Error): LlmProvider {
  return {
    complete: async (_request, observer) => {
      observer?.attemptStarted();
      await new Promise((resolve) => setTimeout(resolve, ms));
      if (error !== undefined) throw error;
      return answer;
    },
  };
}

function harness(inner: LlmProvider) {
  const counted = countingLedger();
  const h = budgetHarness({
    inner,
    ledger: counted.ledger,
    reservationTtlMs: ttlMs,
    clock: timerClock,
  });
  return { ...h, ...counted };
}

const at = (ms: number): Date => new Date(new Date(budgetInstant).getTime() + ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(budgetInstant));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BudgetGuard renewing the reservation of a call in flight', () => {
  it('RF-422 renews every half lifetime to the lifetime from then, and settles once', async () => {
    const h = harness(after(400_000));
    const call = h.guard.complete(budgetRequest(1));

    await vi.advanceTimersByTimeAsync(400_000);
    await call;

    expect(h.renewals).toEqual([
      at(90_000 + ttlMs),
      at(180_000 + ttlMs),
      at(270_000 + ttlMs),
      at(360_000 + ttlMs),
    ]);
    expect(h.calls).toEqual(['renew', 'renew', 'renew', 'renew', 'settle']);
  });

  it('RF-422 renews nothing after the call ends', async () => {
    const h = harness(after(100_000));
    const call = h.guard.complete(budgetRequest(1));
    await vi.advanceTimersByTimeAsync(100_000);
    await call;

    await vi.advanceTimersByTimeAsync(3_600_000);

    expect(h.calls).toEqual(['renew', 'settle']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RF-422 renews nothing for a call that ends before half its lifetime', async () => {
    const h = harness(after(1_000));
    const call = h.guard.complete(budgetRequest(1));
    await vi.advanceTimersByTimeAsync(1_000);
    await call;

    expect(h.calls).toEqual(['settle']);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('BudgetGuard closing a renewed reservation', () => {
  it('RF-428 settles a failed call once, after its last renewal', async () => {
    const failure = new ProviderCallError({ code: ERROR_CODES.providerCallFailed });
    const h = harness(after(100_000, failure));
    const call = failureOf(h.guard.complete(budgetRequest(1)));
    await vi.advanceTimersByTimeAsync(100_000);

    expect(await call).toBe(failure);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.calls).toEqual(['renew', 'settle']);
  });

  it('RF-422 releases a call that was never sent once, after its last renewal', async () => {
    const failure = new ProviderCallError(
      { code: ERROR_CODES.providerCallFailed },
      { notSent: true },
    );
    const h = harness({
      complete: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100_000));
        throw failure;
      },
    });
    const call = failureOf(h.guard.complete(budgetRequest(1)));
    await vi.advanceTimersByTimeAsync(100_000);

    expect(await call).toBe(failure);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.calls).toEqual(['renew', 'release']);
  });
});

describe('BudgetGuard when a renewal fails', () => {
  it('RF-422 logs a renewal that fails and tries again at the next one', async () => {
    const h = harness(after(200_000));
    const renew = h.ledger.renew.bind(h.ledger);
    let failures = 1;
    h.ledger.renew = (key: ReservationKey, expiresAt: Date) => {
      if (failures === 0) return renew(key, expiresAt);
      failures -= 1;
      h.calls.push('failed renew');
      return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
    };
    const call = h.guard.complete(budgetRequest(1));

    await vi.advanceTimersByTimeAsync(200_000);
    await call;

    expect(h.calls).toEqual(['failed renew', 'renew', 'settle']);
    expect(h.logger.entries).toEqual([
      expect.objectContaining({
        level: 'error',
        code: ERROR_CODES.databaseQueryFailed,
        message: 'The reservation could not be renewed.',
      }),
    ]);
  });
});
