import type { Clock } from '../../src/application/ports/clock.js';
import type { ReservationKey } from '../../src/application/ports/cost-ledger.js';
import type { LlmProvider, LlmResponse } from '../../src/application/ports/llm-provider.js';
import { MemoryCostLedger } from '../../src/infrastructure/db/memory-cost-ledger.js';
import { budgetHarness, budgetInstant, budgetRun, type BudgetHarness } from './budget-harness.js';

// RF-422, P3-99: a budget guard whose clock follows the fake timers, around the memory ledger that
// keeps every settle, release and renewal it was asked for, in order. Generated test data only.

export const renewalTtlMs = 180_000;

/** The guard's clock follows the fake timers. */
export const timerClock: Clock = { now: () => new Date() };

/** The instant `ms` after the harness's start. */
export const at = (ms: number): Date => new Date(new Date(budgetInstant).getTime() + ms);

export interface CountingLedger {
  readonly ledger: MemoryCostLedger;
  /** `settle`, `release` and `renew`, in the order they were asked for. */
  readonly calls: string[];
  /** The expiry of each renewal, in order. */
  readonly renewals: Date[];
}

/** The memory ledger with every settle, release and renewal it was asked for, in order. */
export function countingLedger(): CountingLedger {
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

export const renewalAnswer: LlmResponse = {
  text: 'The Catalog area lists products from the database.',
  toolCalls: [],
  usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
  modelVersion: 'contract-model-2026-08-07',
};

/** Waits `ms` on the fake timers; rejects when the signal aborts first. */
export function waitOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('The call was cancelled.'));
    });
  });
}

/** A provider whose one attempt answers, or fails with `error`, after `ms`; it heeds the signal. */
export function answersAfter(ms: number, error?: Error): LlmProvider {
  return {
    complete: async (request, observer) => {
      observer?.attemptStarted();
      await waitOrAbort(ms, request.signal);
      if (error !== undefined) throw error;
      return renewalAnswer;
    },
  };
}

export type RenewalHarness = Omit<BudgetHarness, 'calls' | 'ledger'> & CountingLedger;

export function renewalHarness(inner: LlmProvider): RenewalHarness {
  const counted = countingLedger();
  const h = budgetHarness({
    inner,
    ledger: counted.ledger,
    reservationTtlMs: renewalTtlMs,
    clock: timerClock,
  });
  return { ...h, ...counted };
}

/** Whether a probe reservation of `micros` fits under `limit` right now; it is freed again. */
export async function fitsNow(
  ledger: MemoryCostLedger,
  micros: bigint,
  limit: bigint,
): Promise<boolean> {
  const now = timerClock.now();
  const reservation = {
    callId: 'probe#1',
    userId: budgetRun.userId,
    runId: budgetRun.id,
    role: 'reader',
    keySource: 'server',
    worstCase: { micros, tokens: 1n },
    expiresAt: new Date(now.getTime() + 1),
  } as const;
  const caps = [{ kind: 'run-cost', limit }] as const;
  const result = await ledger.reserve({ reservation, caps, at: now });
  if (result.ok) await ledger.release(reservation);
  return result.ok;
}
