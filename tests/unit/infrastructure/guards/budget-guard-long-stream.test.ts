import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../../src/application/ports/clock.js';
import type { LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryCostLedger } from '../../../../src/infrastructure/db/memory-cost-ledger.js';
import { worstCaseOf } from '../../../../src/infrastructure/guards/budget-pricing.js';
import { OpenAiProvider } from '../../../../src/infrastructure/providers/openai/openai-provider.js';
import { reservationLifetimeMs } from '../../../../src/infrastructure/providers/reservation-lifetime.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import {
  budgetHarness,
  budgetInstant,
  budgetRequest,
  budgetRun,
  contractPrice,
} from '../../../support/budget-harness.js';
import { failureOf } from '../../../support/failure-of.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { loadStreamRecording, streamFetch } from '../../../support/stream-recording.js';

// RF-422, RF-421, ADR-007, Q-60, P3-99: a streamed answer can run longer than its timeout x
// attempts, because the timeout counts only idle time (P3-93). The budget guard keeps the call's
// reservation counting until the call ends, so no other call can reserve against the money the
// stream may still spend. Recorded streams and fake timers only.

const bounds = { kind: 'openai', timeoutSeconds: 120, maxRetries: 0 } as const;
/** 180 seconds: the 300-second stream outlives its first expiry. */
const reservationTtlMs = reservationLifetimeMs(bounds);

/** A long call: streamed, because its output limit is above 8,192 tokens. */
function longRequest(callNumber: number, signal?: AbortSignal): LlmRequest {
  return budgetRequest(callNumber, {
    maxOutputTokens: 16_000,
    ...(signal === undefined ? {} : { signal }),
  });
}

const worstCase = worstCaseOf(contractPrice, {
  promptTokens: estimateInputTokens(longRequest(1)),
  maxOutputTokens: 16_000,
});
/** Room for one long call's worst case, not two. */
const nearCap = [{ kind: 'run-cost', limit: worstCase.micros + worstCase.micros / 2n }] as const;

/** The guard's clock follows the fake timers. */
const timerClock: Clock = { now: () => new Date() };

async function guardedStream(recording: string) {
  const replay = streamFetch(await loadStreamRecording(recording));
  const inner = new OpenAiProvider({
    apiKey: fakeOpenAiKey,
    baseUrl: 'http://127.0.0.1:9/v1',
    testMode: false,
    sleep: () => Promise.resolve(),
    random: () => 0.5,
    fetch: replay.fetch,
    timeoutSeconds: bounds.timeoutSeconds,
    maxRetries: bounds.maxRetries,
  });
  const ledger = new MemoryCostLedger();
  const h = budgetHarness({ inner, ledger, caps: nearCap, reservationTtlMs, clock: timerClock });
  return { ...h, ledger };
}

/** Whether a probe reservation of `micros` fits under the cap right now. */
async function fits(ledger: MemoryCostLedger, micros: bigint): Promise<boolean> {
  const at = timerClock.now();
  const reservation = {
    callId: 'probe#1',
    userId: budgetRun.userId,
    runId: budgetRun.id,
    role: 'reader',
    keySource: 'server',
    worstCase: { micros, tokens: 1n },
    expiresAt: new Date(at.getTime() + 1),
  } as const;
  const result = await ledger.reserve({ reservation, caps: nearCap, at });
  if (result.ok) await ledger.release(reservation);
  return result.ok;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(budgetInstant));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BudgetGuard with a long streamed answer', () => {
  it('RF-422 keeps the reservation of a 300 s stream counting until the stream ends', async () => {
    const h = await guardedStream('openai-long');
    const call = h.guard.complete(longRequest(1));

    await vi.advanceTimersByTimeAsync(250_000);
    expect(await fits(h.ledger, worstCase.micros)).toBe(false);

    await vi.advanceTimersByTimeAsync(51_000);
    expect((await call).text).toBe('token '.repeat(300));
    const entries = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entries).toEqual([expect.objectContaining({ outputTokens: 300 })]);
    expect(await fits(h.ledger, worstCase.micros)).toBe(true);
  });

  it('RF-422 refuses a second call near the cap while the first still streams', async () => {
    const h = await guardedStream('openai-long');
    const first = h.guard.complete(longRequest(1));

    await vi.advanceTimersByTimeAsync(250_000);
    const second = await failureOf(h.guard.complete(longRequest(2)));

    expect(second).toMatchObject({ code: ERROR_CODES.budgetCapReached });
    expect(h.reported.caps).toEqual([expect.objectContaining({ kind: 'run-cost' })]);
    await vi.advanceTimersByTimeAsync(51_000);
    expect((await first).text).toBe('token '.repeat(300));
  });

  it('RF-422 frees the reservation of a stream aborted by the caller', async () => {
    const h = await guardedStream('openai-long');
    const controller = new AbortController();
    const call = failureOf(h.guard.complete(longRequest(1, controller.signal)));

    await vi.advanceTimersByTimeAsync(200_000);
    expect(await fits(h.ledger, worstCase.micros)).toBe(false);
    controller.abort();
    await call;

    expect(await fits(h.ledger, worstCase.micros)).toBe(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(await fits(h.ledger, worstCase.micros)).toBe(true);
  });
});
