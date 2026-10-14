import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

// RF-146, ADR-013: the worker loads the search module that sits next to it and nothing a caller
// names; its input carries only the pattern and the files. P1-155: the worker answers and ends on
// its own; the test does not kill it, and it waits for the end, so no worker outlives its test.

const workerUrl = new URL('../../../../src/infrastructure/files/grep-worker.ts', import.meta.url);

interface WorkerRun {
  readonly answer: unknown;
  readonly exitCode: number;
}

function runWorker(workerData: unknown): Promise<WorkerRun> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData });
    let answer: unknown;
    worker.once('message', (message: unknown) => {
      answer = message;
      void worker.terminate();
    });
    worker.once('error', (cause: unknown) => {
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    });
    worker.once('exit', (exitCode: number) => {
      resolve({ answer, exitCode });
    });
  });
}

const files = [{ path: 'a.txt', lines: ['needle', 'hay'] }];

describe('grep worker', () => {
  it('RF-146 searches with only the pattern and the files as input and ends on its own', async () => {
    const run = await runWorker({ pattern: 'needle', files });

    expect(run.answer).toEqual({ kind: 'matches', matches: [{ path: 'a.txt', line: 1 }] });
    expect(run.exitCode).toBe(0);
  });

  it('RF-146 never loads a search module named by its input', async () => {
    const injected = `data:text/javascript,export function searchFiles(){return {kind:'matches',matches:[{path:'injected',line:1}]}}`;

    const run = await runWorker({ searchModule: injected, pattern: 'needle', files });

    expect(run.answer).toEqual({ kind: 'matches', matches: [{ path: 'a.txt', line: 1 }] });
  });
});
