import { expect, it } from 'vitest';
import type { CachedSnapshot, SnapshotCache } from '../../src/application/ports/snapshot-cache.js';
import { sampleCachedSnapshot } from '../support/snapshot-listing-fixtures.js';

// Architecture section 7: every SnapshotCache adapter (FileSnapshotCache, the memory fake of
// tests/support) passes this suite. RF-1012: complete snapshots are listed by repository, newest
// download first, and a removal takes one snapshot and nothing else.

interface CacheUnderTest {
  readonly cache: SnapshotCache;
  /** Puts a complete snapshot into the cache. */
  readonly add: (snapshot: CachedSnapshot) => Promise<void>;
}

export type FreshCache = () => Promise<CacheUnderTest>;

const shaB = 'b'.repeat(40);
const shaC = 'c'.repeat(40);

export function snapshotCacheContract(name: string, fresh: FreshCache): void {
  it(`RF-1012 ${name} lists the snapshots by repository, newest download first`, async () => {
    const { cache, add } = await fresh();
    const newer = sampleCachedSnapshot({ downloadedAt: '2026-10-12T09:00:00.000Z' });
    const older = sampleCachedSnapshot({
      key: `octo__demo@${shaB}`,
      commitSha: shaB,
      downloadedAt: '2026-10-09T18:40:00.000Z',
    });
    const other = sampleCachedSnapshot({
      key: `acme__tool@${shaC}`,
      repository: 'acme/tool',
      commitSha: shaC,
    });
    for (const snapshot of [older, other, newer]) await add(snapshot);

    expect(await cache.list()).toEqual([other, newer, older]);
  });

  it(`RF-1012 ${name} lists nothing for an empty cache`, async () => {
    const { cache } = await fresh();

    expect(await cache.list()).toEqual([]);
  });

  it(`RF-1012 ${name} removes one snapshot and keeps the others`, async () => {
    const { cache, add } = await fresh();
    const doomed = sampleCachedSnapshot();
    const kept = sampleCachedSnapshot({ key: `octo__demo@${shaB}`, commitSha: shaB });
    await add(doomed);
    await add(kept);

    expect(await cache.remove(doomed.key)).toBe(true);

    expect(await cache.list()).toEqual([kept]);
    expect(await cache.remove(doomed.key)).toBe(false);
  });

  it(`RF-1012 ${name} removes nothing for a key that names no snapshot`, async () => {
    const { cache, add } = await fresh();
    const snapshot = sampleCachedSnapshot();
    await add(snapshot);

    expect(await cache.remove(`octo__none@${shaC}`)).toBe(false);
    expect(await cache.remove('../escape')).toBe(false);
    expect(await cache.remove('')).toBe(false);
    expect(await cache.list()).toEqual([snapshot]);
  });
}
