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

/**
 * The growth policy lives here. A growth test builds its large input growthStep times the size of the small one and
 * fails when the large run takes more than maxGrowth times as long. Linear work gives about 16, quadratic work about 256,
 * so the limit of 64 sits four times from linear (room for cache and GC effects, which push a linear ratio to 20-30) and four times from
 * quadratic. A limit of 8 over a 4x step flaked in CI on linear code (8.176).
 */
export const growthStep = 16;
export const maxGrowth = 64;

/**
 * How much more time the action takes on the large input than on the small one (for growth tests only). Each time is
 * the fastest of several runs, so a loaded runner slows both alike and the ratio stays. Linear work gives about the size
 * ratio (growthStep); quadratic work gives its square. The small time is floored at one millisecond so a near-instant run cannot
 * make the ratio meaningless.
 */
export function growthOf(
  action: (input: string) => unknown,
  small: string,
  large: string,
): { readonly smallMs: number; readonly largeMs: number; readonly ratio: number } {
  action(small); // warm-up, untimed: a cold compiler would make the small run slow and the ratio too high
  const smallMs = fastestOfMs(() => action(small), 3);
  const largeMs = fastestOfMs(() => action(large), 3);
  return { smallMs, largeMs, ratio: largeMs / Math.max(smallMs, 1) };
}

/** How long an asynchronous action takes, with its result (for time-budget tests only). */
export async function timedAsync<T>(
  action: () => Promise<T>,
): Promise<{ readonly result: T; readonly ms: number }> {
  const start = performance.now();
  const result = await action();
  return { result, ms: performance.now() - start };
}
