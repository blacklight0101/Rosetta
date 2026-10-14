import { fireEvent, screen } from '@testing-library/preact';
import { afterEach, vi, expect, it } from 'vitest';
import { json, failure, type Answer } from './fake-api.js';
import { runAnswer, runsPath } from './start-run-fixtures.js';
import { renderStart, start } from './start-run-helpers.js';

// RF-1108, RF-1001 (P1-106): after Start the queued notice reads the run again every few seconds
// (`GET /api/runs/:id`), shows the place moving up, turns into "started" when the run begins and
// into "cancelled" when it was stopped elsewhere, keeps the last place when a read fails, and stops
// reading with the page.

const runPath = '/api/runs/r-1';
const timers = ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const;

const runBody = (queueState: string, position: number | null, extra: object = {}) => ({
  ...{ id: 'r-1', projectId: 'p-1', runId: 'k-1', stage: 'understand', queueState },
  ...{ endState: null, startedAt: null, endedAt: null, commitSha: null, position },
  totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  reportBuilt: false,
  ...extra,
});

/** Answers the successive reads of the run with the given answers; the last one repeats. */
function reads(...answers: readonly Response[]): { answer: Answer; count: () => number } {
  let count = 0;
  const answer: Answer = () => {
    const picked = answers[Math.min(count, answers.length - 1)];
    count += 1;
    return picked?.clone() ?? failure(500, 'RST-2006');
  };
  return { answer, count: () => count };
}

async function queuedAtThree(read: Answer) {
  vi.useFakeTimers({ toFake: [...timers] });
  const page = renderStart({
    [`POST ${runsPath}`]: runAnswer('understand', 3, 'k-1'),
    [`GET ${runPath}`]: read,
  });
  await vi.advanceTimersByTimeAsync(100);
  fireEvent.click(start());
  await vi.advanceTimersByTimeAsync(100);
  return page;
}

const noticeText = (): string => screen.getByTestId('run-notice').textContent;

it('RF-1108 the queued notice shows the place moving up while the run waits', async () => {
  const { answer } = reads(json(200, runBody('Queued', 2)), json(200, runBody('Queued', 1)));
  await queuedAtThree(answer);
  expect(noticeText()).toContain('position 3');

  await vi.advanceTimersByTimeAsync(2000);
  expect(noticeText()).toContain('position 2');

  await vi.advanceTimersByTimeAsync(4000);
  expect(noticeText()).toContain('position 1');
});

it('RF-1108 the notice says the run started once the queue lets it go, and reading stops', async () => {
  const { answer, count } = reads(json(200, runBody('Running', null)));
  await queuedAtThree(answer);

  await vi.advanceTimersByTimeAsync(2000);

  expect(noticeText()).toContain('Run started');
  expect(screen.queryByRole('button', { name: 'Cancel queued run' })).toBeNull();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(count()).toBe(1);
});

it('RF-1108 a run stopped elsewhere before it began is shown as cancelled', async () => {
  const ended = runBody('Ended', null, {
    endState: 'Interrupted',
    endedAt: '2026-10-12T10:00:05.000Z',
  });
  await queuedAtThree(reads(json(200, ended)).answer);

  await vi.advanceTimersByTimeAsync(2000);

  expect(noticeText()).toContain('cancelled');
});

it('RF-1108 a read that fails keeps the last place and the next read goes on', async () => {
  const { answer } = reads(failure(500, 'RST-2006'), json(200, runBody('Queued', 1)));
  await queuedAtThree(answer);

  await vi.advanceTimersByTimeAsync(2000);
  expect(noticeText()).toContain('position 3');
  await vi.advanceTimersByTimeAsync(4000);

  expect(noticeText()).toContain('position 1');
});

it('RF-1108 reading stops when the page is left', async () => {
  const { answer, count } = reads(json(200, runBody('Queued', 3)));
  const page = await queuedAtThree(answer);
  await vi.advanceTimersByTimeAsync(2000);
  expect(count()).toBe(1);

  page.unmount();
  await vi.advanceTimersByTimeAsync(10_000);

  expect(count()).toBe(1);
});

/** Moves the fake clock to `ms` after Start, in steps, so each checkpoint reads the run as of then. */
function clockAt(): (ms: number) => Promise<void> {
  let elapsed = 100;
  return async (ms) => {
    await vi.advanceTimersByTimeAsync(ms - elapsed);
    elapsed = ms;
  };
}

/** Sets the page visibility the way the browser does, then tells the page it changed. */
function setHidden(hidden: boolean): void {
  Reflect.deleteProperty(document, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Reflect.deleteProperty(document, 'hidden');
});

it('RF-1108 the queued read backs off: 2, 4, 8, 16 and then 30 seconds between reads', async () => {
  const { answer, count } = reads(json(200, runBody('Queued', 3)));
  await queuedAtThree(answer);
  const at = clockAt();
  // Each pair is a checkpoint half a second before and after the read that is due.
  const checkpoints: readonly (readonly [number, number])[] = [
    [1500, 0],
    [2500, 1],
    [5500, 1],
    [6500, 2],
    [13500, 2],
    [14500, 3],
    [29500, 3],
    [30500, 4],
    [59500, 4],
    [60500, 5],
    [89500, 5],
    [90500, 6],
  ];

  for (const [ms, expected] of checkpoints) {
    await at(ms);
    expect(count(), `reads by ${String(ms)} ms`).toBe(expected);
  }
});

it('RF-1108 reading stops while the page is hidden and goes on at once when it is shown', async () => {
  const { answer, count } = reads(json(200, runBody('Queued', 3)));
  await queuedAtThree(answer);
  await vi.advanceTimersByTimeAsync(2500);
  expect(count()).toBe(1);

  setHidden(true);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(count()).toBe(1);

  setHidden(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(count()).toBe(2);
});

it('RF-1108 no timer is left once the run has started', async () => {
  const { answer } = reads(json(200, runBody('Running', null)));
  await queuedAtThree(answer);

  await vi.advanceTimersByTimeAsync(2500);

  expect(noticeText()).toContain('Run started');
  expect(vi.getTimerCount()).toBe(0);
});

/**
 * The first read answers with a body that arrives only when `release` is called, so the read is
 * in flight until then; every later read answers at once with the queued run.
 */
function holding(body: object): { answer: Answer; release: () => void; count: () => number } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const text = new TextEncoder().encode(JSON.stringify(body));
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      await gate;
      controller.enqueue(text);
      controller.close();
    },
  });
  let count = 0;
  const answer: Answer = () => {
    count += 1;
    return count === 1
      ? new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } })
      : json(200, runBody('Queued', 3));
  };
  return { answer, release: () => release(), count: () => count };
}

it('RF-1108 hiding and showing during a read starts no second read', async () => {
  const held = holding(runBody('Queued', 3));
  const page = await queuedAtThree(held.answer);
  await vi.advanceTimersByTimeAsync(2500);
  expect(held.count()).toBe(1);

  setHidden(true);
  setHidden(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(held.count()).toBe(1);

  held.release();
  await vi.advanceTimersByTimeAsync(100);
  page.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('RF-1108 a read that ends while the page is hidden arms no timer, and showing reads at once', async () => {
  const held = holding(runBody('Queued', 3));
  const page = await queuedAtThree(held.answer);
  await vi.advanceTimersByTimeAsync(2500);
  expect(held.count()).toBe(1);

  setHidden(true);
  held.release();
  await vi.advanceTimersByTimeAsync(100);
  expect(vi.getTimerCount()).toBe(0);
  expect(held.count()).toBe(1);

  setHidden(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(held.count()).toBe(2);
  page.unmount();
});

it('RF-1108 after the page is left, showing it again reads nothing', async () => {
  const { answer, count } = reads(json(200, runBody('Queued', 3)));
  const page = await queuedAtThree(answer);
  await vi.advanceTimersByTimeAsync(2500);
  expect(count()).toBe(1);

  page.unmount();
  setHidden(true);
  setHidden(false);
  await vi.advanceTimersByTimeAsync(100);

  expect(count()).toBe(1);
});
