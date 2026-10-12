import { describe, expect, it } from 'vitest';
import { Semaphore } from '../../../../src/infrastructure/security/semaphore.js';

// ADR-015 note (DEC-112): at most two scrypt hashes run at a time, so the semaphore lets a fixed
// number of tasks run and queues the rest in arrival order.

interface Gate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

function gate(): Gate {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

describe('Semaphore', () => {
  it('RF-1100 runs at most the limit of tasks at a time and starts the rest in order', async () => {
    const semaphore = new Semaphore(2);
    const gates = [gate(), gate(), gate(), gate()];
    const started: number[] = [];
    const runs = gates.map((item, index) =>
      semaphore.run(async () => {
        started.push(index);
        await item.promise;
        return index;
      }),
    );

    await settle();
    const firstWave = [...started];
    gates[1]?.open();
    await settle();
    const secondWave = [...started];
    for (const item of gates) item.open();

    expect(firstWave).toEqual([0, 1]);
    expect(secondWave).toEqual([0, 1, 2]);
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3]);
  });

  it('RF-1100 frees the slot when a task fails', async () => {
    const semaphore = new Semaphore(1);

    const failed = semaphore.run(() => Promise.reject(new Error('task failed')));
    const next = semaphore.run(() => Promise.resolve('next ran'));

    await expect(failed).rejects.toThrow('task failed');
    expect(await next).toBe('next ran');
  });

  it('RF-1100 refuses a limit below one', () => {
    expect(() => new Semaphore(0)).toThrow(RangeError);
  });
});
