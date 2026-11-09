import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest } from '../../../src/application/ports/llm-provider.js';
import { RunBudgetEvents } from '../../../src/application/runs/run-budget-events.js';
import { ReaderRoom } from '../../../src/application/understand/reader-room.js';
import { priceCall, worstCaseOf } from '../../../src/infrastructure/guards/budget-pricing.js';
import { FakeProvider } from '../../../src/infrastructure/providers/fake/fake-provider.js';
import { estimateInputTokens } from '../../../src/infrastructure/providers/usage-estimate.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { budgetHarness, budgetRequest, budgetTable } from '../../support/budget-harness.js';
import { recordingOf } from '../../support/fake-recordings.js';
import { heldProvider, settle } from '../../support/parallel-judgement.js';

// RF-429, RF-422, P8-132, Q-67: four readers start together at a cap that cannot pay for two calls at
// their worst case. The readers' room counts the calls in flight, so one call is made, answered and
// booked, and the run stops at its cap after it (the call in flight is not cancelled), where the
// budget guard used to refuse the second call at once and stop the run with nothing booked.

const none = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costMicros: 0n };
const tasks = ['reader-001', 'reader-002', 'reader-003', 'reader-004'];
const runCap = (micros: bigint) => [{ kind: 'run-cost', limit: micros } as const];

function answerOf(inputTokens: number, outputTokens: number) {
  return {
    retried: [],
    response: {
      text: 'done',
      toolCalls: [],
      usage: { inputTokens, outputTokens, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'stop',
    },
  } as const;
}

/** What the guard reserves for one call of the contract request, as the readers' room estimates it. */
function worstCaseOfCall(request: LlmRequest) {
  const { price } = priceCall(
    { table: budgetTable, overrides: [], allowUnpriced: false },
    { kind: 'openai', keySource: 'server' },
    request.model,
  );
  return worstCaseOf(price, {
    promptTokens: estimateInputTokens(request),
    maxOutputTokens: request.maxOutputTokens ?? 0,
  });
}

/** The readers' room over the run's budget events, with the guard's worst case of a call. */
function roomOver(events: RunBudgetEvents, limits: ConstructorParameters<typeof ReaderRoom>[1]) {
  return new ReaderRoom(
    {
      spend: (role) => events.roleSpend(role),
      runSpend: () => events.runSpend(),
      stoppedAtLine: () => false,
      announce: () => Promise.resolve(),
      worstCaseOf: worstCaseOfCall,
    },
    limits,
  );
}

/** Four reader tasks over a real budget guard and memory ledger, each call held until let go. */
function fourReaders(
  cap: bigint,
  usage: { input: number; output: number },
  tokenCap = 10_000_000n,
) {
  const run = new AbortController();
  const events = new RunBudgetEvents({
    events: { emit: () => Promise.resolve(undefined) },
    run: none,
    project: none,
  });
  const fake = new FakeProvider({
    testMode: true,
    recording: recordingOf(...tasks.map(() => answerOf(usage.input, usage.output))),
  });
  const held = heldProvider(fake);
  const cancellable: LlmProvider = {
    complete: async (request, observer) => {
      const response = await held.provider.complete(request, observer);
      if (request.signal.aborted) throw new RosettaError(ERROR_CODES.budgetCapReached);
      return response;
    },
  };
  const bookedAtStop: number[] = [];
  const budget = budgetHarness({
    inner: cancellable,
    caps: runCap(cap),
    budgetEvents: events,
    stopRun: () => {
      bookedAtStop.push(budget.costs.length);
      run.abort();
    },
  });
  const room = roomOver(events, { runTokens: tokenCap, runMicros: cap, callTokens: 512n });
  const calls = tasks.map((task, index) =>
    room
      .guard(budget.guard, task)
      .complete(budgetRequest(index + 1, { signal: run.signal }))
      .then(
        () => 'answered',
        (error: unknown) => (error instanceof RosettaError ? error.code : 'failed'),
      ),
  );
  return { budget, held, calls, bookedAtStop };
}

/** Lets the held calls go one after the other until every reader's call has ended. */
async function finish(parts: ReturnType<typeof fourReaders>): Promise<string[]> {
  for (let round = 0; round < 8; round += 1) {
    await settle();
    parts.held.holds.forEach((gate) => {
      gate.open();
    });
  }
  return Promise.all(parts.calls);
}

const { micros: oneCall, tokens: oneCallTokens } = worstCaseOfCall(budgetRequest());

describe('four readers at a cap that cannot pay for two calls', () => {
  it('RF-429 P8-132 the run stops at its cap only after the first call was answered and booked', async () => {
    // The answer uses its whole worst case, so the cap is used up by the one call.
    const parts = fourReaders(oneCall + oneCall / 2n, { input: 200, output: 512 });

    const ends = await finish(parts);

    expect(parts.held.state.peak).toBe(1);
    expect(parts.budget.costs).toHaveLength(1);
    expect([...new Set(parts.bookedAtStop)]).toEqual([1]);
    expect(ends[0]).toBe('answered');
    expect(ends.slice(1)).toEqual(Array(3).fill(ERROR_CODES.budgetCapReached));
  });

  it('RF-429 P8-132 a cap that pays for one call after another reads every reader in turn, never together', async () => {
    const parts = fourReaders(oneCall + oneCall / 2n, { input: 10, output: 5 });

    const ends = await finish(parts);

    expect(parts.held.state.peak).toBe(1);
    expect(parts.bookedAtStop).toEqual([]);
    expect(ends).toEqual(Array(4).fill('answered'));
    expect(parts.budget.costs).toHaveLength(4);
  });

  it('RF-429 P8-132 at a cap that pays for every call in flight the four readers start at once', async () => {
    const parts = fourReaders(oneCall * 5n, { input: 10, output: 5 });

    const ends = await finish(parts);

    expect(parts.held.state.peak).toBe(4);
    expect(parts.bookedAtStop).toEqual([]);
    expect(ends).toEqual(Array(4).fill('answered'));
  });

  it('RF-429 P8-132 a token cap that pays for one call at a time reads every reader in turn, though the cost cap is wide', async () => {
    const parts = fourReaders(
      oneCall * 10n,
      { input: 10, output: 5 },
      oneCallTokens + oneCallTokens / 2n,
    );

    const ends = await finish(parts);

    expect(parts.held.state.peak).toBe(1);
    expect(ends).toEqual(Array(4).fill('answered'));
    expect(parts.budget.costs).toHaveLength(4);
  });
});
