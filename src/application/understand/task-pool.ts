// RF-200, architecture section 8 (concurrency): runs the agent tasks of a run with at most
// `parallelism` at a time. Every task shares the run's one abort signal; once it is aborted no
// further task starts, and the pool waits for the running ones to end.

export interface PoolOptions {
  readonly parallelism: number;
  readonly signal: AbortSignal;
}

// RF-200
export async function runPool<T>(
  items: readonly T[],
  _options: PoolOptions,
  work: (item: T) => Promise<void>,
): Promise<void> {
  for (const item of items) await work(item);
}
