import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservationKey } from '../../../../src/application/ports/cost-ledger.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { ProviderCallError } from '../../../../src/infrastructure/providers/provider-call-error.js';
import { budgetInstant, budgetRequest } from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import {
  answersAfter,
  at,
  renewalHarness,
  renewalTtlMs,
} from '../../../support/renewal-harness.js';

// RF-422, ADR-007, P3-99: while a call is in flight the budget guard renews its reservation, every
// third of the reservation's lifetime, to the lifetime from now; when the call ends (answered,
// failed or never sent) the guard stops renewing, waits for a renewal under way, then settles or
// releases the reservation exactly once.

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(budgetInstant));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BudgetGuard renewing the reservation of a call in flight', () => {
  it('RF-422 renews every third of the lifetime to the lifetime from then, and settles once', async () => {
    const h = renewalHarness(answersAfter(200_000));
    const call = h.guard.complete(budgetRequest(1));

    await vi.advanceTimersByTimeAsync(200_000);
    await call;

    expect(h.renewals).toEqual([
      at(60_000 + renewalTtlMs),
      at(120_000 + renewalTtlMs),
      at(180_000 + renewalTtlMs),
    ]);
    expect(h.calls).toEqual(['renew', 'renew', 'renew', 'settle']);
  });

  it('RF-422 renews nothing after the call ends', async () => {
    const h = renewalHarness(answersAfter(100_000));
    const call = h.guard.complete(budgetRequest(1));
    await vi.advanceTimersByTimeAsync(100_000);
    await call;

    await vi.advanceTimersByTimeAsync(3_600_000);

    expect(h.calls).toEqual(['renew', 'settle']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RF-422 renews nothing for a call that ends before a third of its lifetime', async () => {
    const h = renewalHarness(answersAfter(1_000));
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
    const h = renewalHarness(answersAfter(100_000, failure));
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
    const h = renewalHarness({
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

describe('BudgetGuard ending a call during a renewal', () => {
  it('RF-422 waits for a renewal under way before it settles the call', async () => {
    const h = renewalHarness(answersAfter(65_000));
    const renew = h.ledger.renew.bind(h.ledger);
    h.ledger.renew = async (key: ReservationKey, expiresAt: Date) => {
      h.calls.push('renewal started');
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      await renew(key, expiresAt);
    };
    const call = h.guard.complete(budgetRequest(1));

    await vi.advanceTimersByTimeAsync(65_000);
    expect(h.calls).toEqual(['renewal started']);
    await vi.advanceTimersByTimeAsync(10_000);
    await call;

    expect(h.calls).toEqual(['renewal started', 'renew', 'settle']);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.calls).toHaveLength(3);
  });
});
