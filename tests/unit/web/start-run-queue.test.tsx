import { fireEvent, screen } from '@testing-library/preact';
import { vi, expect, it } from 'vitest';
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

  await vi.advanceTimersByTimeAsync(2000);
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
  await vi.advanceTimersByTimeAsync(2000);

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
