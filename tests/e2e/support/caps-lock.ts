import { mkdir, readdir, rm, stat } from 'node:fs/promises';
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

const CAPS_LOCK_PREFIX = 'rosetta-e2e-caps-lock-';

/**
 * Removes the caps lock folders under `root` that are older than `maxAgeMs`: a run killed while it
 * held the lock leaves its folder behind. Returns how many were removed (P1-150).
 */
export async function removeStaleCapsLocks(
  root: string,
  nowMs: number,
  maxAgeMs: number,
): Promise<number> {
  let removed = 0;
  for (const name of await readdir(root)) {
    if (!name.startsWith(CAPS_LOCK_PREFIX)) continue;
    const folder = join(root, name);
    const modified = await stat(folder).then(
      (info) => info.mtimeMs,
      () => undefined,
    );
    if (modified === undefined || nowMs - modified <= maxAgeMs) continue;
    await rm(folder, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

/**
 * The lock of this run: keyed by the run key that global-setup.ts sets, so a run killed while it
 * held the lock leaves a folder that no later run looks at (P1-150). `root` is the folder the lock
 * lives in: the shared temp folder by default, a private one for a test that must not share it.
 */
export function capsLockFolder(root: string = tmpdir()): string {
  const run = process.env['ROSETTA_E2E_RUN_KEY'] ?? 'unkeyed';
  return join(root, `${CAPS_LOCK_PREFIX}${String(e2ePort())}-${run}`);
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

/** Creates the lock folder; it fails when the folder exists (EEXIST). */
type CreateFolder = (folder: string) => Promise<unknown>;

export interface CapsLockOptions {
  readonly staleAfterMs?: number;
  /** The harness clock; the system clock by default. */
  readonly clock?: Clock;
  /** The create of the lock folder; `mkdir` by default. A seam for tests that refuse it (P1-155). */
  readonly createFolder?: CreateFolder;
}

const defaultCreateFolder: CreateFolder = (folder) => mkdir(folder);
const CREATE_ATTEMPTS = 5;
const CREATE_RETRY_MS = 100;

function codeOf(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

async function tryTake(folder: string, create: CreateFolder): Promise<boolean> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await create(folder);
      return true;
    } catch (error) {
      if (codeOf(error) === 'EEXIST') return false;
      // Windows refuses a create with EPERM for a moment after a removal; the lock is retried, not failed.
      if (codeOf(error) === 'EPERM' && attempt < CREATE_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, CREATE_RETRY_MS));
        continue;
      }
      throw new Error('The caps lock folder could not be created.', { cause: error });
    }
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
async function takeOverIfStale(
  folder: string,
  staleAfterMs: number,
  clock: Clock,
  create: CreateFolder,
): Promise<void> {
  const gate = `${folder}.takeover`;
  if (!(await tryTake(gate, create))) {
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
  const create = options.createFolder ?? defaultCreateFolder;
  while (!(await tryTake(folder, create))) {
    if (await isStale(folder, staleAfterMs, clock))
      await takeOverIfStale(folder, staleAfterMs, clock, create);
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
