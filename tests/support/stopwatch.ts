import { performance } from 'node:perf_hooks';

/** How long a synchronous action takes, in milliseconds (for time-budget tests only). */
export function elapsedMs(action: () => unknown): number {
  const start = performance.now();
  action();
  return performance.now() - start;
}
