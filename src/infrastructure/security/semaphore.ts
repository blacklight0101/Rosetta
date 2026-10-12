// ADR-015 note (DEC-112): limits how many tasks run at once (at most two scrypt hashes, so the
// host's memory stays bounded). Waiting tasks start in arrival order.
export class Semaphore {
  private readonly limit: number;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('A semaphore needs a limit of at least one.');
    }
    this.limit = limit;
  }

  /** Runs the task when a slot is free and frees the slot when it settles. */
  // RF-1100
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /** Hands the slot to the next waiting task, or frees it. */
  private release(): void {
    const next = this.waiting.shift();
    if (next === undefined) this.active -= 1;
    else next();
  }
}
