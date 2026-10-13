import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
