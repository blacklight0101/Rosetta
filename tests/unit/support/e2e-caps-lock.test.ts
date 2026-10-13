import { mkdir, mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/application/ports/clock.js';
import { acquireCapsLock } from '../../e2e/support/caps-lock.js';

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
    await rm(root, { recursive: true, force: true });
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
    await rm(root, { recursive: true, force: true });
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
    await rm(root, { recursive: true, force: true });
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
    await rm(root, { recursive: true, force: true });
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
