import { describe, expect, it } from 'vitest';
import { runPool } from '../../../../src/application/understand/task-pool.js';

// RF-200, architecture section 8: reader tasks run with a configurable parallelism and one shared
// abort signal.

interface Gate {
  readonly opened: Promise<void>;
  open(): void;
}

function gate(): Gate {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** Lets every pending promise callback run. */
async function settle(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

describe('the task pool of an understand run', () => {
  it('RF-200 runs at most `parallelism` tasks at a time and starts the next when one ends', async () => {
    const gates = [gate(), gate(), gate(), gate()];
    const started: number[] = [];
    const pool = runPool(
      [0, 1, 2, 3],
      { parallelism: 2, signal: new AbortController().signal },
      async (index) => {
        started.push(index);
        await gates[index]?.opened;
      },
    );

    await settle();
    expect(started).toEqual([0, 1]);
    gates[1]?.open();
    await settle();
    expect(started).toEqual([0, 1, 2]);
    for (const each of gates) each.open();
    await pool;
    expect(started).toEqual([0, 1, 2, 3]);
  });
});

describe('the task pool and the shared signal', () => {
  it('RF-200 starts no task after the shared signal is aborted and waits for the running ones', async () => {
    const controller = new AbortController();
    const first = gate();
    const started: number[] = [];
    let finished = false;
    const pool = runPool(
      [0, 1, 2],
      { parallelism: 1, signal: controller.signal },
      async (index) => {
        started.push(index);
        if (index === 0) {
          await first.opened;
          finished = true;
        }
      },
    );

    await settle();
    controller.abort();
    first.open();
    await pool;

    expect(started).toEqual([0]);
    expect(finished).toBe(true);
  });

  it('RF-200 a parallelism below one still runs the tasks one at a time', async () => {
    const started: number[] = [];

    await runPool([0, 1], { parallelism: 0, signal: new AbortController().signal }, (index) => {
      started.push(index);
      return Promise.resolve();
    });

    expect(started).toEqual([0, 1]);
  });
});
