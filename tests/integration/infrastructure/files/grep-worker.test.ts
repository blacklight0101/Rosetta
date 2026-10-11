import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

// RF-146, ADR-013: the worker loads the search module that sits next to it and nothing a caller
// names; its input carries only the pattern and the files.

const workerUrl = new URL('../../../../src/infrastructure/files/grep-worker.ts', import.meta.url);

function runWorker(workerData: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData });
    worker.once('message', (message: unknown) => {
      resolve(message);
      void worker.terminate();
    });
    worker.once('error', (cause: unknown) => {
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    });
  });
}

const files = [{ path: 'a.txt', lines: ['needle', 'hay'] }];

describe('grep worker', () => {
  it('RF-146 searches with only the pattern and the files as input', async () => {
    await expect(runWorker({ pattern: 'needle', files })).resolves.toEqual({
      kind: 'matches',
      matches: [{ path: 'a.txt', line: 1 }],
    });
  });

  it('RF-146 never loads a search module named by its input', async () => {
    const injected = `data:text/javascript,export function searchFiles(){return {kind:'matches',matches:[{path:'injected',line:1}]}}`;

    await expect(runWorker({ searchModule: injected, pattern: 'needle', files })).resolves.toEqual({
      kind: 'matches',
      matches: [{ path: 'a.txt', line: 1 }],
    });
  });
});
