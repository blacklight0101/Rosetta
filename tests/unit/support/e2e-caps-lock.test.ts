import { mkdir, mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/application/ports/clock.js';
import { acquireCapsLock, capsLockFolder } from '../../e2e/support/caps-lock.js';

// RF-1106, P1-131: the caps of the administration page are server-wide, so the end-to-end specs
// that write them take turns. The lock is a folder: only one process can create it.

describe('e2e caps lock', () => {
  let root: string;
  let folder: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-caps-lock-'));
    folder = join(root, 'lock');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('RF-1106 lets a second taker in only after the first released', async () => {
    const first = await acquireCapsLock(folder);
    const order: string[] = [];
    const second = acquireCapsLock(folder).then(async (lock) => {
      order.push('second');
      await lock.release();
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    order.push('first released');
    await first.release();
    await second;

    expect(order).toEqual(['first released', 'second']);
  });

  it('RF-1106 reports how long the taker waited', async () => {
    const first = await acquireCapsLock(folder);
    const second = acquireCapsLock(folder);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await first.release();
    const lock = await second;

    expect(lock.waitedMs).toBeGreaterThanOrEqual(300);
    await lock.release();
  });
});

describe('e2e caps lock, a holder that is gone', () => {
  let root: string;
  let folder: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-caps-lock-'));
    folder = join(root, 'lock');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('RF-1106 takes over a lock whose holder is gone (older than the stale limit)', async () => {
    await acquireCapsLock(folder);
    const old = new Date(Date.now() - 60_000);
    await utimes(folder, old, old);

    const lock = await acquireCapsLock(folder, { staleAfterMs: 30_000 });

    expect(lock.waitedMs).toBeLessThan(5000);
    await lock.release();
  });

  it('RF-1106 a release lets the next taker in at once and a second release is harmless', async () => {
    const first = await acquireCapsLock(folder);
    await first.release();
    await first.release();

    const next = await acquireCapsLock(folder);

    expect(next.waitedMs).toBeLessThan(200);
    await next.release();
  });
});

describe('e2e caps lock, the takeover gate', () => {
  let root: string;
  let folder: string;
  let gate: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-caps-lock-'));
    folder = join(root, 'lock');
    gate = `${folder}.takeover`;
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('RF-1106 a takeover waits while another waiter holds the takeover gate', async () => {
    await acquireCapsLock(folder);
    const old = new Date(Date.now() - 60_000);
    await utimes(folder, old, old);
    await mkdir(gate);
    let taken = false;
    const pending = acquireCapsLock(folder, { staleAfterMs: 30_000 }).then((lock) => {
      taken = true;
      return lock;
    });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(taken).toBe(false);
    await rm(gate, { recursive: true, force: true });
    const lock = await pending;

    expect(lock.waitedMs).toBeGreaterThanOrEqual(300);
    await lock.release();
  });

  it('RF-1106 a takeover gate left by a dead waiter is itself taken over', async () => {
    await acquireCapsLock(folder);
    const old = new Date(Date.now() - 60_000);
    await utimes(folder, old, old);
    await mkdir(gate);
    await utimes(gate, old, old);

    const lock = await acquireCapsLock(folder, { staleAfterMs: 30_000 });

    expect(lock.waitedMs).toBeLessThan(5000);
    await lock.release();
  });
});

describe('e2e caps lock, the re-check under the gate', () => {
  let root: string;
  let folder: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-caps-lock-'));
    folder = join(root, 'lock');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('RF-1106 a waiter that judged the lock stale re-checks it under the gate before removing it', async () => {
    const first = await acquireCapsLock(folder);
    let calls = 0;
    // Call 2 is the waiter's first staleness check and sees the lock an hour old; later calls are real.
    const clock: Clock = {
      now: () => {
        calls += 1;
        return calls === 2 ? new Date(Date.now() + 3_600_000) : new Date();
      },
    };
    const second = acquireCapsLock(folder, { staleAfterMs: 30_000, clock });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await first.release();
    const lock = await second;

    expect(lock.waitedMs).toBeGreaterThanOrEqual(400);
    await lock.release();
  });
});

describe('e2e caps lock, one folder per run', () => {
  let root: string;

  beforeEach(async () => {
    // A root of this test process alone: a stale folder that a killed run left in the shared temp
    // folder is never looked at, so it cannot make this run wait for its stale timeout.
    root = await mkdtemp(join(tmpdir(), 'rosetta-caps-run-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('RNF-005 a run key gives each run its own folder, so a killed run cannot hold the next one', async () => {
    const before = process.env['ROSETTA_E2E_RUN_KEY'];
    process.env['ROSETTA_E2E_RUN_KEY'] = 'killed-run';
    const killed = capsLockFolder(root);
    try {
      // The killed run took the lock and never released it.
      await acquireCapsLock(killed);
      process.env['ROSETTA_E2E_RUN_KEY'] = 'next-run';

      expect(capsLockFolder(root)).not.toBe(killed);
      const lock = await acquireCapsLock(capsLockFolder(root));

      expect(lock.waitedMs).toBeLessThan(200);
      await lock.release();
    } finally {
      if (before === undefined) delete process.env['ROSETTA_E2E_RUN_KEY'];
      else process.env['ROSETTA_E2E_RUN_KEY'] = before;
    }
  });
});

describe('the caps lock folder root', () => {
  it('RNF-005 lives in the temp folder by default, where the global setup looks for old ones', () => {
    expect(dirname(capsLockFolder())).toBe(tmpdir());
  });

  it('RNF-005 lives in the root it is given', () => {
    expect(dirname(capsLockFolder(join(tmpdir(), 'elsewhere')))).toBe(join(tmpdir(), 'elsewhere'));
  });
});

/** A create that fails with `code` for the first `failures` calls, then makes the folder. */
function flakyCreate(
  code: string,
  failures: number,
): { create: (path: string) => Promise<void>; calls: () => number } {
  let calls = 0;
  return {
    create: async (path: string) => {
      calls += 1;
      if (calls <= failures) throw Object.assign(new Error(`${code}: refused`), { code });
      await mkdir(path);
    },
    calls: () => calls,
  };
}

describe('e2e caps lock, a create that Windows refuses for a moment', () => {
  let root: string;
  let folder: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rosetta-caps-lock-'));
    folder = join(root, 'lock');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('RNF-005 retries a create refused with EPERM and takes the lock when the refusal passes', async () => {
    const flaky = flakyCreate('EPERM', 2);

    const lock = await acquireCapsLock(folder, { createFolder: flaky.create });

    expect(flaky.calls()).toBe(3);
    await lock.release();
  });

  it('RNF-005 gives up after a bounded number of EPERM refusals and says so', async () => {
    const flaky = flakyCreate('EPERM', Number.POSITIVE_INFINITY);

    const attempt = acquireCapsLock(folder, { createFolder: flaky.create });

    await expect(attempt).rejects.toThrow('The caps lock folder could not be created.');
    expect(flaky.calls()).toBe(5);
  });

  it('RNF-005 does not retry a create refused for another reason', async () => {
    const flaky = flakyCreate('EACCES', Number.POSITIVE_INFINITY);

    await expect(acquireCapsLock(folder, { createFolder: flaky.create })).rejects.toThrow(
      'The caps lock folder could not be created.',
    );
    expect(flaky.calls()).toBe(1);
  });
});
