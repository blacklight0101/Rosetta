import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservationKey } from '../../../../src/application/ports/cost-ledger.js';
import type { LlmProvider } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { worstCaseOf } from '../../../../src/infrastructure/guards/budget-pricing.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetInstant, budgetRequest, contractPrice } from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import {
  answersAfter,
  fitsNow,
  renewalAnswer,
  renewalHarness,
  waitOrAbort,
  type RenewalHarness,
} from '../../../support/renewal-harness.js';

// RF-422, RF-428, ADR-007, P3-99: a renewal that fails is logged and tried again after a short
// back-off, well inside the reservation's lifetime, so one failure never lets the reservation
// lapse; a failure of the log itself changes nothing. When renewals keep failing until less than
// a sixth of the lifetime is left, the guard stops the call (RST-1604) and settles or releases
// its reservation once, before it can lapse: a call in flight never outlives its reservation.

const request = budgetRequest(1);
const worstCase = worstCaseOf(contractPrice, {
  promptTokens: estimateInputTokens(request),
  maxOutputTokens: request.maxOutputTokens ?? 0,
});
const databaseDown = (): Promise<never> =>
  Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));

/** Whether the call's reservation has stopped counting: one more micro fits under its worst case. */
const callReservationGone = (h: RenewalHarness): Promise<boolean> =>
  fitsNow(h.ledger, 1n, worstCase.micros);

let unhandled: unknown[] = [];
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};

beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(budgetInstant));
});

afterEach(() => {
  vi.useRealTimers();
  process.off('unhandledRejection', onUnhandled);
});

describe('BudgetGuard when a renewal fails', () => {
  it('RF-422 keeps the answer and the renewals when a renewal and its log entry both fail', async () => {
    const h = renewalHarness(answersAfter(100_000));
    const renew = h.ledger.renew.bind(h.ledger);
    let failures = 1;
    h.ledger.renew = (key: ReservationKey, expiresAt: Date) => {
      if (failures === 0) return renew(key, expiresAt);
      failures -= 1;
      h.calls.push('failed renew');
      return databaseDown();
    };
    h.logger.log = () => Promise.reject(new Error('disk full'));
    const call = h.guard.complete(request);

    await vi.advanceTimersByTimeAsync(100_000);

    expect(await call).toBe(renewalAnswer);
    expect(h.calls).toEqual(['failed renew', 'renew', 'settle']);
    await vi.advanceTimersByTimeAsync(3_600_000);
    await new Promise<void>((resolve) => {
      process.nextTick(resolve);
    });
    expect(unhandled).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('BudgetGuard when one slow renewal fails', () => {
  it('RF-422 keeps the reservation counting at its first expiry after one failed slow renewal', async () => {
    const h = renewalHarness(answersAfter(300_000));
    const renew = h.ledger.renew.bind(h.ledger);
    let failures = 1;
    h.ledger.renew = async (key: ReservationKey, expiresAt: Date) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      if (failures === 0) return renew(key, expiresAt);
      failures -= 1;
      return databaseDown();
    };
    const call = h.guard.complete(request);

    await vi.advanceTimersByTimeAsync(179_999);
    expect(await callReservationGone(h)).toBe(false);
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await callReservationGone(h)).toBe(false);
    await vi.advanceTimersByTimeAsync(65_000);
    expect(await callReservationGone(h)).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(await call).toBe(renewalAnswer);
    expect(h.logger.entries).toEqual([
      expect.objectContaining({ code: ERROR_CODES.databaseQueryFailed }),
    ]);
  });
});

describe('BudgetGuard when renewals keep failing', () => {
  it('RF-422 stops the call before its reservation lapses and settles it once', async () => {
    const h = renewalHarness(answersAfter(400_000));
    h.ledger.renew = () => {
      h.calls.push('failed renew');
      return databaseDown();
    };
    const call = failureOf(h.guard.complete(request));

    await vi.advanceTimersByTimeAsync(149_999);
    expect(h.calls).not.toContain('settle');
    await vi.advanceTimersByTimeAsync(1);

    expect(await call).toMatchObject({ code: ERROR_CODES.costRecordFailed });
    expect(await callReservationGone(h)).toBe(true);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.calls.filter((name) => name !== 'failed renew')).toEqual(['settle']);
    expect(h.stops).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('RF-422 stops a call that was never sent and releases its reservation once', async () => {
    const neverSent: LlmProvider = {
      complete: async (call) => {
        await waitOrAbort(400_000, call.signal);
        return renewalAnswer;
      },
    };
    const h = renewalHarness(neverSent);
    h.ledger.renew = databaseDown;
    const call = failureOf(h.guard.complete(request));

    await vi.advanceTimersByTimeAsync(150_000);

    expect(await call).toMatchObject({ code: ERROR_CODES.costRecordFailed });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(h.calls).toEqual(['release']);
  });
});
