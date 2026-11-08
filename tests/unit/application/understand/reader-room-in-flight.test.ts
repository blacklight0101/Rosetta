import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ReaderRoom } from '../../../../src/application/understand/reader-room.js';
import type { Spend } from '../../../../src/domain/budget/claim-room.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { hold, settle, type Hold } from '../../../support/parallel-judgement.js';

// RF-429, RF-422, P8-132, Q-67: the readers' room counts the calls in flight, as the budget guard
// counts their reservations. A call that fits the run caps only if the calls in flight finish first
// waits for them, so a tiny cap is spent on one call that is answered and booked, and a run at a
// normal cap still starts every reader at once.

const answer = fakeResponse({
  text: 'done',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
});

/** One call's worst case: its prompt and its output limit. */
const oneCall: Spend = { tokens: 6_000n, micros: 6_000n };
const limits = { runTokens: 10_000n, runMicros: 0n, callTokens: 4_000n };

interface Setup {
  readonly room: ReaderRoom;
  readonly started: string[];
  readonly gates: Hold[];
  readonly spent: { run: Spend };
  guarded(task: string, signal?: AbortSignal): ReturnType<LlmProvider['complete']>;
}

/** A room over a run whose booked spend the test moves, and a provider that answers when let go. */
function setup(caps: Partial<typeof limits> = {}, worst: Spend | null = oneCall): Setup {
  const spent = { run: { tokens: 0n, micros: 0n } };
  const room = new ReaderRoom(
    {
      spend: () => spent.run,
      runSpend: () => spent.run,
      stoppedAtLine: () => false,
      announce: () => Promise.resolve(),
      ...(worst === null ? {} : { worstCaseOf: () => worst }),
    },
    { ...limits, ...caps },
  );
  const started: string[] = [];
  const gates: Hold[] = [];
  const inner: LlmProvider = {
    complete: async (request: LlmRequest) => {
      started.push(request.context.agentTaskId);
      const gate = hold();
      gates.push(gate);
      await gate.opened;
      return answer;
    },
  };
  const guarded = (task: string, signal?: AbortSignal): ReturnType<LlmProvider['complete']> =>
    room.guard(inner, task).complete({
      ...contractRequest(),
      ...(signal === undefined ? {} : { signal }),
      context: { ...contractRequest().context, agentTaskId: task },
    });
  return { room, started, gates, spent, guarded };
}

const tasks = ['reader-001', 'reader-002', 'reader-003', 'reader-004'];

describe('P8-132 the readers room counts the calls in flight', () => {
  it('RF-429 four readers at a cap that pays for one call start one call and the others wait', async () => {
    const s = setup();

    const calls = tasks.map((task) => s.guarded(task));
    await settle();

    expect(s.started).toEqual(['reader-001']);
    expect(s.room.reason).toBeUndefined();
    s.spent.run = { tokens: 100n, micros: 100n };
    for (let round = 0; round < 6; round += 1) {
      s.gates.forEach((gate) => {
        gate.open();
      });
      await settle();
    }
    await Promise.all(calls);
  });

  it('RF-429 the call that waited starts when the call in flight has ended and was booked', async () => {
    const s = setup();
    const calls = tasks.slice(0, 2).map((task) => s.guarded(task));
    await settle();
    expect(s.started).toEqual(['reader-001']);

    s.spent.run = { tokens: 2_000n, micros: 2_000n };
    s.gates[0]?.open();
    await settle();

    expect(s.started).toEqual(['reader-001', 'reader-002']);
    s.gates[1]?.open();
    await Promise.all(calls);
  });
});

describe('P8-132 the readers room leaves a run at a normal cap alone', () => {
  it('RF-429 a run at a normal cap starts every reader at once', async () => {
    const s = setup({ runTokens: 1_000_000n, runMicros: 1_000_000n });

    const calls = tasks.map((task) => s.guarded(task));
    await settle();

    expect(s.started).toEqual(tasks);
    s.gates.forEach((gate) => {
      gate.open();
    });
    await Promise.all(calls);
  });

  it('RF-429 the cost cap counts the calls in flight too', async () => {
    const s = setup({ runTokens: 1_000_000n, runMicros: 10_000n });

    const calls = tasks.slice(0, 2).map((task) => s.guarded(task));
    await settle();

    expect(s.started).toEqual(['reader-001']);
    s.gates[0]?.open();
    await settle();
    s.gates[1]?.open();
    await Promise.all(calls);
  });
});

describe('P8-132 the readers room and the budget guard keep RF-422', () => {
  it('RF-422 a call that cannot be paid for even alone is passed on to the budget guard to be refused', async () => {
    const s = setup({ runTokens: 5_000n });

    const call = s.guarded('reader-001');
    await settle();

    expect(s.started).toEqual(['reader-001']);
    s.gates[0]?.open();
    await call;
  });
});

describe('P8-132 the readers room holds back only what the cap cannot pay for', () => {
  it('RF-429 one reader at a time is never held back by the room, whatever is left of the cap', async () => {
    const s = setup();

    const first = s.guarded('reader-001');
    await settle();
    s.spent.run = { tokens: 4_000n, micros: 4_000n };
    s.gates[0]?.open();
    await first;
    const second = s.guarded('reader-001');
    await settle();

    expect(s.started).toEqual(['reader-001', 'reader-001']);
    s.gates[1]?.open();
    await second;
  });

  it('RF-429 without a worst case the room only holds its own check, as before', async () => {
    const s = setup({}, null);

    const calls = tasks.map((task) => s.guarded(task));
    await settle();

    expect(s.started).toEqual(tasks);
    s.gates.forEach((gate) => {
      gate.open();
    });
    await Promise.all(calls);
  });

  it('RF-422 a call that waited is refused as before when the readers have no room left once it wakes', async () => {
    const s = setup();
    const first = s.guarded('reader-001');
    const second = s.guarded('reader-002');
    await settle();

    s.spent.run = { tokens: 7_000n, micros: 7_000n };
    s.gates[0]?.open();
    await first;

    await expect(second).rejects.toMatchObject({ code: ERROR_CODES.budgetCapReached });
    expect(s.room.reason).toBe('share');
    expect(s.started).toEqual(['reader-001']);
  });
});

/** The calls of the four readers that are let through at once, then let go so none is left hanging. */
async function startedAt(s: Setup, count: number): Promise<string[]> {
  const calls = tasks.slice(0, count).map((task) => s.guarded(task));
  await settle();
  const started = [...s.started];
  for (let round = 0; round < 8; round += 1) {
    s.gates.forEach((gate) => {
      gate.open();
    });
    await settle();
  }
  await Promise.all(calls);
  return started;
}

describe('P8-132 the readers room counts what is booked beside the calls in flight', () => {
  const small: Spend = { tokens: 3_000n, micros: 3_000n };

  it('RF-429 the tokens already booked count: a call that fits only without them waits', async () => {
    const s = setup({}, small);
    s.spent.run = { tokens: 5_000n, micros: 0n };

    expect(await startedAt(s, 2)).toEqual(['reader-001']);
  });

  it('RF-429 the cost already booked counts: a call that fits only without it waits', async () => {
    const s = setup({ runTokens: 1_000_000n, runMicros: 10_000n }, small);
    s.spent.run = { tokens: 0n, micros: 5_000n };

    expect(await startedAt(s, 2)).toEqual(['reader-001']);
  });
});

describe('P8-132 the readers room lets a call through when it fits the cap exactly', () => {
  const half: Spend = { tokens: 5_000n, micros: 5_000n };

  it('RF-429 calls whose worst cases add up to the token cap are all let through, one more waits', async () => {
    const s = setup({ runTokens: 10_000n, runMicros: 0n }, half);

    expect(await startedAt(s, 3)).toEqual(['reader-001', 'reader-002']);
  });

  it('RF-429 calls whose worst cases add up to the cost cap are all let through, one more waits', async () => {
    const s = setup({ runTokens: 1_000_000n, runMicros: 10_000n }, half);

    expect(await startedAt(s, 3)).toEqual(['reader-001', 'reader-002']);
  });
});

describe('P8-132 the readers room keeps each call in flight as an entry of its own', () => {
  it('RF-429 a source that hands out the same figures each time still has each call counted', async () => {
    // `oneCall` is one object, returned for every call: a cap for two calls starts two, not three.
    const s = setup({ runTokens: 13_000n, runMicros: 0n });

    expect(await startedAt(s, 3)).toEqual(['reader-001', 'reader-002']);
  });

  it('RF-429 a call whose run is already stopped goes straight to the provider, whatever is in flight', async () => {
    const s = setup();
    const first = s.guarded('reader-001');
    await settle();

    const stopped = s.guarded('reader-002', AbortSignal.abort());
    await settle();

    expect(s.started).toEqual(['reader-001', 'reader-002']);
    s.gates.forEach((gate) => {
      gate.open();
    });
    await Promise.all([first, stopped]);
  });

  it('RF-429 RF-422 a waiting call whose run is stopped goes to the provider at the next wake, not behind the calls in flight', async () => {
    // P8-138: a Stop aborts the run's one signal while a call is parked in the room (reader-task hands
    // the run's signal to every call); the call is woken by the next release and must not wait again.
    const s = setup();
    const stop = new AbortController();
    const calls = [
      s.guarded('reader-001'),
      s.guarded('reader-002'),
      s.guarded('reader-003', stop.signal),
    ];
    await settle();
    expect(s.started).toEqual(['reader-001']);

    stop.abort();
    s.gates[0]?.open();
    await settle();

    expect(s.started).toEqual(['reader-001', 'reader-002', 'reader-003']);
    s.gates.forEach((gate) => {
      gate.open();
    });
    await Promise.allSettled(calls);
  });
});
