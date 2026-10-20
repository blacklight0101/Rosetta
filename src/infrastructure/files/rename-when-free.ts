import { access, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// RF-003, RNF-002: Windows refuses to rename onto a file that another handle has open (the page reading
// a run's manifest while the run writes it) with EPERM, EBUSY or EACCES, for as long as the handle is
// open: a few milliseconds. Those three are tried again a bounded number of times, a little later each
// time, while the file to move is still there; any other failure, and the last of these, surfaces at once.

const BUSY_CODES: ReadonlySet<string> = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_TRIES = 12;
const STEP_MS = 20;

function isBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && BUSY_CODES.has(String(error.code));
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Renames `from` onto `to`, waiting for a target that another handle holds open. */
// RNF-002
export async function renameWhenFree(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error: unknown) {
      if (attempt >= MAX_TRIES || !isBusy(error) || !(await exists(from))) throw error;
      await delay(attempt * STEP_MS);
    }
  }
}
