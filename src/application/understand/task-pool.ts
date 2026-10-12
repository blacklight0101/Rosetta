// RF-200, architecture section 8 (concurrency): runs the agent tasks of a run with at most
// `parallelism` at a time. Every task shares the run's one abort signal; once it is aborted no
// further task starts, and the pool waits for the running ones to end. A parallelism below one
// counts as one.

export interface PoolOptions {
  readonly parallelism: number;
  readonly signal: AbortSignal;
}

// RF-200
export async function runPool<T>(
  items: readonly T[],
  options: PoolOptions,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const { signal } = options;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length && !signal.aborted) {
      const item = items[next];
      next += 1;
      if (item !== undefined) await work(item);
    }
  };
  const width = Math.max(1, Math.min(options.parallelism, items.length));
  await Promise.all(Array.from({ length: width }, worker));
}
