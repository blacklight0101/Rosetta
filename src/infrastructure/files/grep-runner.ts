import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-146: starts the grep worker and terminates it when the timeout passes.

export interface GrepFile {
  readonly path: string;
  /** Lines already cut to the limit. */
  readonly lines: readonly string[];
}

const outcome = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('matches'),
    matches: z.array(z.object({ path: z.string(), line: z.number().int() })),
  }),
  z.object({ kind: z.literal('invalid-pattern'), detail: z.string() }),
]);

export type GrepOutcome = z.infer<typeof outcome> | { readonly kind: 'timeout' };

// The worker sits next to this file: `.ts` when run from source, `.js` from the build.
const extension = extname(fileURLToPath(import.meta.url));
const workerUrl = new URL(`./grep-worker${extension}`, import.meta.url);

export function runGrep(
  pattern: string,
  files: readonly GrepFile[],
  timeoutMs: number,
): Promise<GrepOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { workerData: { pattern, files } });
    const timer = setTimeout(() => {
      resolve({ kind: 'timeout' });
      void worker.terminate();
    }, timeoutMs);
    const finish = (settle: () => void): void => {
      clearTimeout(timer);
      settle();
      void worker.terminate();
    };
    const fail = (cause: unknown): void => {
      finish(() => {
        reject(new RosettaError(ERROR_CODES.grepFailed, undefined, { cause }));
      });
    };
    worker.once('message', (message: unknown) => {
      const parsed = outcome.safeParse(message);
      if (parsed.success)
        finish(() => {
          resolve(parsed.data);
        });
      else fail(parsed.error);
    });
    worker.once('error', fail);
    // A worker that ends without an answer failed; after an answer this is a no-op.
    worker.once('exit', fail);
  });
}
