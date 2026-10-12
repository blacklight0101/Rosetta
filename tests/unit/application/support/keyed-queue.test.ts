import { describe, expect, it } from 'vitest';
import { KeyedQueue } from '../../../../src/application/support/keyed-queue.js';

// RF-1100: parallel sign-in attempts on one user name run one after another, so none of them reads
// a failure count another one has not written yet; other user names are not held up.

function gate(): { readonly opened: Promise<void>; open(): void } {
  let open = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('KeyedQueue', () => {
  it('RF-1100 runs tasks with the same key one after another, in arrival order', async () => {
    const queue = new KeyedQueue();
    const order: string[] = [];
    const first = gate();

    const one = queue.run('amy', async () => {
      await first.opened;
      order.push('one');
    });
    const two = queue.run('amy', () => {
      order.push('two');
      return Promise.resolve();
    });
    const other = queue.run('bob', () => {
      order.push('other');
      return Promise.resolve();
    });
    await other;
    first.open();
    await Promise.all([one, two]);

    expect(order).toEqual(['other', 'one', 'two']);
  });

  it('RF-1100 a failing task passes its error on and does not stop the next one', async () => {
    const queue = new KeyedQueue();

    const failing = queue.run('amy', () => Promise.reject(new Error('boom')));
    const next = queue.run('amy', () => Promise.resolve('next'));

    await expect(failing).rejects.toThrow('boom');
    expect(await next).toBe('next');
  });

  it('RF-1100 forgets a key once its last task has settled', async () => {
    const queue = new KeyedQueue();

    await queue.run('amy', () => Promise.resolve(1));
    await Promise.resolve();

    expect(queue.size).toBe(0);
  });
});
