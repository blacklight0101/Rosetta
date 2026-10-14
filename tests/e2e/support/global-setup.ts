import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { removeStaleCapsLocks } from './caps-lock.js';

// P1-150: every run takes a caps lock folder of its own (caps-lock.ts). The key is set before the
// workers start, so they inherit it; a run killed while it held the lock cannot make the next wait.
// The folders that such runs left more than a day ago are removed here.

export const staleCapsLockMs = 24 * 60 * 60 * 1000;

/** Gives the run its key and removes the stale caps lock folders under `root`. */
export async function prepareRun(root: string, nowMs: number): Promise<void> {
  process.env['ROSETTA_E2E_RUN_KEY'] = randomUUID();
  await removeStaleCapsLocks(root, nowMs, staleCapsLockMs);
}

export default async function globalSetup(): Promise<void> {
  await prepareRun(tmpdir(), new SystemClock().now().getTime());
}
