// P5-15, RF-301: the judgements of a step run in parallel, but the first call of each one reaches
// the provider in claim order, so the numbering of the calls and the answers a recording hands out
// do not depend on which file was read first. A claim takes its turn once every claim before it has
// sent its first call or has ended without one; a turn is passed at most once.

export class CallTurn {
  private next = 0;
  private readonly passed = new Set<number>();
  private readonly waiting = new Map<number, () => void>();

  /** Resolves when it is the claim's turn to send its first call. */
  wait(index: number): Promise<void> {
    if (index <= this.next) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.set(index, resolve);
    });
  }

  /** The claim has sent its first call or will send none. */
  pass(index: number): void {
    this.passed.add(index);
    while (this.passed.has(this.next)) this.next += 1;
    const resolve = this.waiting.get(this.next);
    if (resolve !== undefined) {
      this.waiting.delete(this.next);
      resolve();
    }
  }
}

/** One claim's view of the turn. */
export interface ClaimTurn {
  readonly wait: () => Promise<void>;
  readonly pass: () => void;
}

export function turnOf(turn: CallTurn, index: number): ClaimTurn {
  return {
    wait: () => turn.wait(index),
    pass: () => {
      turn.pass(index);
    },
  };
}

type Job = (() => Promise<void>) | null;

// RF-301, RF-1004: the verdict events of a step are published in claim order, each as soon as every
// claim before it has its verdict, so the events do not depend on which call ended first.
export class OrderedPublisher {
  private readonly slots: (Job | undefined)[];
  private next = 0;
  private draining = false;
  private running: Promise<void> = Promise.resolve();

  constructor(count: number) {
    this.slots = Array.from({ length: count }, () => undefined);
  }

  /** Whether the claim's slot is settled: it has a verdict to publish or none to give. */
  has(index: number): boolean {
    return this.slots[index] !== undefined;
  }

  /** Settles a slot (`null`: no event) and publishes every slot now ready, in order. */
  publish(index: number, job: Job): Promise<void> {
    this.slots[index] = job;
    if (!this.draining) {
      this.draining = true;
      this.running = this.drain();
    }
    return this.running;
  }

  private async drain(): Promise<void> {
    try {
      for (;;) {
        const job = this.slots[this.next];
        if (job === undefined) return;
        this.next += 1;
        if (job !== null) await job();
      }
    } finally {
      this.draining = false;
    }
  }
}
