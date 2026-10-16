import type { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { runGrep } from '../../../../src/infrastructure/files/grep-runner.js';

// RF-146, P1-164, P1-165: the runner settles on the first verdict only, and a worker that ends
// without any answer fails the call instead of leaving it hanging. A fake worker plays the sequences
// a real thread cannot be made to produce on demand.

const fakes = vi.hoisted((): { workers: EventEmitter[] } => ({ workers: [] }));

vi.mock('node:worker_threads', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeWorker extends Emitter {
    readonly terminate = vi.fn(() => Promise.resolve(0));
    constructor() {
      super();
      fakes.workers.push(this);
    }
  }
  return { Worker: FakeWorker };
});

const answer = { kind: 'matches', matches: [{ path: 'a.txt', line: 1 }] } as const;

function start(): { done: ReturnType<typeof runGrep>; worker: EventEmitter } {
  fakes.workers.length = 0;
  const done = runGrep('row', [{ path: 'a.txt', lines: ['row'] }], 10_000);
  const [worker] = fakes.workers;
  if (worker === undefined) throw new Error('The runner started no worker');
  return { done, worker };
}

describe('grep runner verdicts', () => {
  it('RF-146 a worker that ends without an answer fails the call with RST-1112', async () => {
    const { done, worker } = start();

    worker.emit('exit', 0);

    await expect(done).rejects.toBeInstanceOf(RosettaError);
    await expect(done).rejects.toMatchObject({ code: ERROR_CODES.grepFailed });
  });

  it('RF-146 the first verdict wins: an answer is not undone by a later error', async () => {
    const { done, worker } = start();

    worker.emit('message', answer);
    worker.emit('error', new Error('late failure'));
    worker.emit('exit', 0);

    await expect(done).resolves.toEqual(answer);
  });

  it('RF-146 the first verdict wins: a failure is not undone by a later answer', async () => {
    const { done, worker } = start();

    worker.emit('error', new Error('early failure'));
    worker.emit('message', answer);
    worker.emit('exit', 1);

    await expect(done).rejects.toMatchObject({ code: ERROR_CODES.grepFailed });
  });

  it('RF-146 the caller hears the verdict only once the worker has exited', async () => {
    const { done, worker } = start();
    const settled = vi.fn();
    void done.then(settled, settled);

    worker.emit('message', answer);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    worker.emit('exit', 0);
    await expect(done).resolves.toEqual(answer);
  });
});
