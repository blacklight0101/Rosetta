import { performance } from 'node:perf_hooks';

/** How long a synchronous action takes, in milliseconds (for time-budget tests only). */
function elapsedMs(action: () => unknown): number {
  const start = performance.now();
  action();
  return performance.now() - start;
}

/**
 * The shortest of a few runs of a synchronous action, in milliseconds (for time-budget tests only). One
 * run on a shared CI runner can be slowed by a cold compiler or a neighbour job; the shortest of
 * several is what the code itself takes, and an action that is really too slow is slow in every run.
 */
export function fastestOfMs(action: () => unknown, runs = 3): number {
  return Math.min(...Array.from({ length: runs }, () => elapsedMs(action)));
}

/** How long an asynchronous action takes, with its result (for time-budget tests only). */
export async function timedAsync<T>(
  action: () => Promise<T>,
): Promise<{ readonly result: T; readonly ms: number }> {
  const start = performance.now();
  const result = await action();
  return { result, ms: performance.now() - start };
}
