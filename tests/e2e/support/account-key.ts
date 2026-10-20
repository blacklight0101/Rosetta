import { createHash } from 'node:crypto';
import { test } from '@playwright/test';

// The key of the account of the running test (seed.ts, `accountFor`).

/**
 * A key of the running test's account: kind, project, spec file, worker, parallel slot and repeat.
 * Concurrent tests are in different workers; a serial journey keeps one worker and one repeat, so its
 * steps share the account; a restarted worker gets a new key. Two tests of one file that a single
 * worker runs one after the other (`--workers=1`, or a worker that is free first) share the account
 * too, with its projects and its saved plan briefs, unless they name different projects (P3-59).
 */
export function currentTestKey(kind: string, project: string): string {
  let info: ReturnType<typeof test.info>;
  try {
    info = test.info();
  } catch (error) {
    throw new Error(
      `accountFor('${kind}') was called outside a test; use preseededAccountFor or call it inside a test.`,
      { cause: error },
    );
  }
  const parts = [
    kind,
    project,
    info.file,
    info.workerIndex,
    info.parallelIndex,
    info.repeatEachIndex,
  ];
  const digest = createHash('sha256').update(parts.map(String).join('|'));
  return digest.digest('hex').slice(0, 20);
}
