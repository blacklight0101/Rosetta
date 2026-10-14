import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ResourceLimits, Worker } from 'node:worker_threads';
import { z } from 'zod';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { grepLimits, grepWorkerLimits } from './grep-limits.js';

// RF-146: starts the grep worker and terminates it when the timeout passes. The worker stops one
// match past the cap (P1-67), so a pattern that matches every line costs no more than the cap.

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
  resourceLimits: ResourceLimits = grepWorkerLimits,
): Promise<GrepOutcome> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: { pattern, files, maxMatches: grepLimits.maxMatches },
      resourceLimits,
    });
    // P1-164: the first verdict wins, but the caller hears it only once the thread has ended, so no
    // worker outlives the call. A worker that answered ends on its own (P1-155): terminating it
    // while it tears down is what killed the Windows test workers (0xC0000005, 0xC0000409).
    let verdict: (() => void) | undefined;
    const decide = (settle: () => void): void => {
      verdict ??= settle;
    };
    const fail = (cause: unknown): void => {
      decide(() => {
        reject(new RosettaError(ERROR_CODES.grepFailed, undefined, { cause }));
      });
    };
    const timer = setTimeout(() => {
      decide(() => {
        resolve({ kind: 'timeout' });
      });
      void worker.terminate();
    }, timeoutMs);
    worker.once('message', (message: unknown) => {
      const parsed = outcome.safeParse(message);
      if (parsed.success)
        decide(() => {
          resolve(parsed.data);
        });
      else fail(parsed.error);
    });
    // A worker past its resource limits emits ERR_WORKER_OUT_OF_MEMORY here (P1-160).
    worker.once('error', fail);
    worker.once('exit', () => {
      clearTimeout(timer);
      // A worker that ends without a verdict failed.
      if (verdict === undefined) fail(new Error('The grep worker ended without an answer'));
      verdict?.();
    });
  });
}
