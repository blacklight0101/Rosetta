import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { grepLimits } from '../../../../src/infrastructure/files/grep-limits.js';
import { runGrep } from '../../../../src/infrastructure/files/grep-runner.js';

// RF-146, P1-119: the worker stops one match past the cap, so a pattern that matches every line of
// many files costs no more than the cap and the caller can still tell the list was cut.

function rows(count: number): string[] {
  return Array.from({ length: count }, () => 'row');
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every worker the runner subscribes to; a thread that has ended reports `threadId` -1. */
function trackWorkers(): () => Worker[] {
  const once = vi.spyOn(Worker.prototype, 'once');
  return () => [...new Set(once.mock.contexts)];
}

describe('grep runner', () => {
  it('RF-146 stops at one match past the cap and never reads the files after it', async () => {
    const files = [
      { path: 'a.txt', lines: rows(600) },
      { path: 'b.txt', lines: rows(600) },
      { path: 'c.txt', lines: rows(600) },
    ];

    const outcome = await runGrep('row', files, 10_000);

    expect(outcome.kind).toBe('matches');
    const matches = outcome.kind === 'matches' ? outcome.matches : [];
    expect(matches).toHaveLength(grepLimits.maxMatches + 1);
    expect(matches.at(-1)).toEqual({ path: 'b.txt', line: 401 });
    expect(matches.some((match) => match.path === 'c.txt')).toBe(false);
  });

  it('P1-164 a worker that answered ends on its own: the runner never terminates it', async () => {
    const terminate = vi.spyOn(Worker.prototype, 'terminate');

    const outcome = await runGrep('row', [{ path: 'a.txt', lines: rows(3) }], 10_000);

    expect(outcome.kind).toBe('matches');
    expect(terminate).not.toHaveBeenCalled();
  });

  it('P1-164 the answer comes only after the worker thread has ended', async () => {
    const workers = trackWorkers();

    const outcome = await runGrep('row', [{ path: 'a.txt', lines: rows(3) }], 10_000);

    expect(outcome.kind).toBe('matches');
    expect(workers()).toHaveLength(1);
    expect(workers().every((worker) => worker.threadId === -1)).toBe(true);
  });

  it('P1-164 a timeout resolves only after the terminated worker has ended', async () => {
    const terminate = vi.spyOn(Worker.prototype, 'terminate');
    const workers = trackWorkers();
    const hostile = [{ path: 'a.txt', lines: [`${'a'.repeat(40)}!`] }];

    const outcome = await runGrep('^(a+)+$', hostile, 100);

    expect(outcome).toEqual({ kind: 'timeout' });
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(workers().every((worker) => worker.threadId === -1)).toBe(true);
  });
});
