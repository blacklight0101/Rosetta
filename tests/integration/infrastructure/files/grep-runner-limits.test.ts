import type * as WorkerThreads from 'node:worker_threads';
import { describe, expect, it, vi } from 'vitest';
import { runGrep } from '../../../../src/infrastructure/files/grep-runner.js';

// RF-146, P1-160 (F-06): the grep worker runs under V8 resource limits, and a worker that passes
// them ends the call with RST-1112 instead of taking the process down.

const seen = vi.hoisted((): { options: unknown[] } => ({ options: [] }));

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkerThreads>();
  class RecordingWorker extends actual.Worker {
    constructor(url: string | URL, options?: WorkerThreads.WorkerOptions) {
      super(url, options);
      seen.options.push(options);
    }
  }
  return { ...actual, Worker: RecordingWorker };
});

/** Lines that take far more than `megabytes` MB once copied into the worker. */
function heavyLines(megabytes: number): string[] {
  return Array.from(
    { length: megabytes * 512 },
    (_, index) => `${String(index)}${'x'.repeat(1990)}`,
  );
}

describe('grep worker resource limits', () => {
  it('RF-146 every grep worker runs with 256 MB old space, 32 MB young space, 16 MB code and a 4 MB stack', async () => {
    seen.options.length = 0;

    const outcome = await runGrep('row', [{ path: 'a.txt', lines: ['row'] }], 10_000);

    expect(outcome.kind).toBe('matches');
    expect(seen.options).toHaveLength(1);
    expect(seen.options[0]).toMatchObject({
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 32,
        codeRangeSizeMb: 16,
        stackSizeMb: 4,
      },
    });
  });

  it('RF-146 a worker that runs out of memory ends the grep with RST-1112, and the next grep works', async () => {
    const files = [{ path: 'big.txt', lines: heavyLines(64) }];
    const tight = { maxOldGenerationSizeMb: 8, maxYoungGenerationSizeMb: 2 };

    await expect(runGrep('needle', files, 30_000, tight)).rejects.toMatchObject({
      code: 'RST-1112',
      cause: { code: 'ERR_WORKER_OUT_OF_MEMORY' },
    });
    expect(await runGrep('row', [{ path: 'a.txt', lines: ['row'] }], 10_000)).toEqual({
      kind: 'matches',
      matches: [{ path: 'a.txt', line: 1 }],
    });
  });
});
