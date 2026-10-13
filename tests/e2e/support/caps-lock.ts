import { mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Clock } from '../../../src/application/ports/clock.js';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { e2ePort } from './server-config.js';

// RF-1106, P1-131: the caps of the administration page are server-wide, so the end-to-end specs
// that write them (tagged @caps) take turns. The lock is a folder: `mkdir` without `recursive`
// fails when it exists, so exactly one process holds it. A holder that died leaves the folder
// behind; one older than `staleAfterMs` (more than a test may last) is taken over.

/** The tag of a test that writes the server-wide caps. */
export const capsTag = '@caps';

/** The lock of this run (one run per port). */
export function capsLockFolder(): string {
  return join(tmpdir(), `rosetta-e2e-caps-lock-${String(e2ePort())}`);
}

const POLL_MS = 100;
const DEFAULT_STALE_MS = 600_000;
// The takeover gate is held for a stat and a removal, so a gate older than this was left by a
// process that died while holding it.
const GATE_STALE_MS = 10_000;

export interface CapsLock {
  /** How long the taker waited for the turn. */
  readonly waitedMs: number;
  /** Gives the turn up; calling it again does nothing. */
  release(): Promise<void>;
}

export interface CapsLockOptions {
  readonly staleAfterMs?: number;
  /** The harness clock; the system clock by default. */
  readonly clock?: Clock;
}

async function tryTake(folder: string): Promise<boolean> {
  try {
    await mkdir(folder);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false;
    throw new Error('The caps lock folder could not be created.', { cause: error });
  }
}

async function isStale(folder: string, staleAfterMs: number, clock: Clock): Promise<boolean> {
  try {
    return clock.now().getTime() - (await stat(folder)).mtimeMs > staleAfterMs;
  } catch {
    return false;
  }
}

/**
 * Removes a stale lock folder under the takeover gate, so two waiters that both judged it stale
 * cannot both remove it: the second one would remove the lock the first one took in its place.
 * This narrows the race between a stale takeover and a holder that is releasing; it does not
 * close it, because the removal and the release are not atomic.
 */
async function takeOverIfStale(folder: string, staleAfterMs: number, clock: Clock): Promise<void> {
  const gate = `${folder}.takeover`;
  if (!(await tryTake(gate))) {
    if (await isStale(gate, GATE_STALE_MS, clock)) await rm(gate, { recursive: true, force: true });
    return;
  }
  try {
    if (await isStale(folder, staleAfterMs, clock))
      await rm(folder, { recursive: true, force: true });
  } finally {
    await rm(gate, { recursive: true, force: true });
  }
}

/** Waits for the turn and returns the lock; the caller releases it in a `finally`. */
export async function acquireCapsLock(
  folder: string,
  options: CapsLockOptions = {},
): Promise<CapsLock> {
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_MS;
  const clock = options.clock ?? new SystemClock();
  const started = clock.now().getTime();
  await mkdir(dirname(folder), { recursive: true });
  while (!(await tryTake(folder))) {
    if (await isStale(folder, staleAfterMs, clock))
      await takeOverIfStale(folder, staleAfterMs, clock);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  let released = false;
  return {
    waitedMs: clock.now().getTime() - started,
    release: async () => {
      if (released) return;
      released = true;
      await rm(folder, { recursive: true, force: true });
    },
  };
}
