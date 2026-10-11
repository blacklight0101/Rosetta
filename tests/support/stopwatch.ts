import { performance } from 'node:perf_hooks';

/** How long a synchronous action takes, in milliseconds (for time-budget tests only). */
export function elapsedMs(action: () => unknown): number {
  const start = performance.now();
  action();
  return performance.now() - start;
}

/** How long an asynchronous action takes, with its result (for time-budget tests only). */
export async function timedAsync<T>(
  action: () => Promise<T>,
): Promise<{ readonly result: T; readonly ms: number }> {
  const start = performance.now();
  const result = await action();
  return { result, ms: performance.now() - start };
}
