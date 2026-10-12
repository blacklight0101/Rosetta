import { performance } from 'node:perf_hooks';

// RF-110, P1-75: the scan-wide parse budget. Only the time spent inside the language packs counts.
// Once it is spent, no further file goes to a pack, and a pack that can stop part-way is told to
// stop through `PackFile.shouldStop`; a pack that cannot overruns it by at most one file.

/** The default total parse time of one scan: two minutes. */
const defaultParseBudgetMs = 120_000;

export interface ParseBudget {
  /** The total milliseconds the packs may spend on one scan. */
  readonly totalMs: number;
  /** A monotonic clock in milliseconds; `performance.now` when absent. Tests pass a fake one. */
  readonly now?: () => number;
}

/** Measures the time the packs spend on one scan against its budget. */
export class ParseTimer {
  readonly totalMs: number;
  private readonly now: () => number;
  private spentMs = 0;
  private startedAt: number | undefined;

  constructor(budget: ParseBudget = { totalMs: defaultParseBudgetMs }) {
    this.totalMs = budget.totalMs;
    this.now = budget.now ?? (() => performance.now());
  }

  /** True once the time spent, including a parse still running, reaches the budget. */
  readonly exhausted = (): boolean => {
    const running = this.startedAt === undefined ? 0 : this.now() - this.startedAt;
    return this.spentMs + running >= this.totalMs;
  };

  /** Runs one pack call and adds its duration to the time spent, also when it throws. */
  measure<T>(work: () => T): T {
    this.startedAt = this.now();
    try {
      return work();
    } finally {
      this.spentMs += this.now() - this.startedAt;
      this.startedAt = undefined;
    }
  }
}
