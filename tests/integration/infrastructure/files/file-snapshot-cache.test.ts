import { chmod, mkdir, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CachedSnapshot } from '../../../../src/application/ports/snapshot-cache.js';
import { FileSnapshotCache } from '../../../../src/infrastructure/files/file-snapshot-cache.js';
import { snapshotCacheContract } from '../../../contracts/snapshot-cache.contract.js';
import { sampleCachedSnapshot, snapshotSha } from '../../../support/snapshot-listing-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-1012, RF-005, data-model.md section 3.3: FileSnapshotCache lists the complete snapshots of
// `<data>/sources/` from their snapshot.json and removes one, though the fetcher left it read-only.

const data = useWritableTempRoot('rosetta-snapshots-');

function infoOf(snapshot: CachedSnapshot): string {
  const [owner = '', repo = ''] = snapshot.repository.split('/');
  return JSON.stringify({
    schemaVersion: 1,
    url: `https://github.com/${snapshot.repository}`,
    owner,
    repo,
    commitSha: snapshot.commitSha,
    resolvedFrom: 'main',
    downloadedAt: snapshot.downloadedAt,
    fileCount: snapshot.fileCount,
    totalBytes: snapshot.totalBytes,
    skippedLinks: 0,
    snapshotHash: `sha256:${'0'.repeat(64)}`,
    licence: 'MIT',
  });
}

/** Lays a snapshot out as the fetcher leaves it: a files tree and snapshot.json, all read-only. */
async function lay(snapshot: CachedSnapshot): Promise<void> {
  const folder = join(data.path, 'sources', snapshot.key);
  await mkdir(join(folder, 'files', 'src'), { recursive: true });
  await writeFile(join(folder, 'files', 'src', 'Program.cs'), 'class Program {}');
  await writeFile(join(folder, 'snapshot.json'), infoOf(snapshot));
  for (const file of [join(folder, 'files', 'src', 'Program.cs'), join(folder, 'snapshot.json')]) {
    await chmod(file, 0o444);
  }
  for (const dir of [join(folder, 'files', 'src'), join(folder, 'files'), folder]) {
    await chmod(dir, 0o555);
  }
}

describe('FileSnapshotCache', () => {
  snapshotCacheContract('FileSnapshotCache', () =>
    Promise.resolve({ cache: new FileSnapshotCache(data.path), add: lay }),
  );

  it('RF-1012 removes a read-only snapshot tree completely', async () => {
    const snapshot = sampleCachedSnapshot();
    await lay(snapshot);

    expect(await new FileSnapshotCache(data.path).remove(snapshot.key)).toBe(true);

    expect(await readdir(join(data.path, 'sources'))).toEqual([]);
  });

  it('RF-122 does not list a partial download, a folder without snapshot.json or a damaged one', async () => {
    const complete = sampleCachedSnapshot();
    await lay(complete);
    const sources = join(data.path, 'sources');
    await mkdir(join(sources, '.partial-abc', 'files'), { recursive: true });
    await mkdir(join(sources, `octo__empty@${'c'.repeat(40)}`), { recursive: true });
    const damaged = join(sources, `octo__damaged@${'d'.repeat(40)}`);
    await mkdir(damaged, { recursive: true });
    await writeFile(join(damaged, 'snapshot.json'), '{not json');

    expect(await new FileSnapshotCache(data.path).list()).toEqual([complete]);
  });

  it('RF-1012 lists nothing when the sources folder does not exist yet', async () => {
    expect(await new FileSnapshotCache(join(data.path, 'not-created')).list()).toEqual([]);
  });
});

describe('FileSnapshotCache hostile keys', () => {
  it('RF-005 never removes anything outside the sources folder, whatever the key says', async () => {
    const outside = join(data.path, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'keep.txt'), 'kept');
    await mkdir(join(data.path, 'sources'), { recursive: true });
    const cache = new FileSnapshotCache(data.path);

    for (const key of ['../outside', '..', '.', 'octo__x@../../outside', outside]) {
      expect(await cache.remove(key)).toBe(false);
    }

    expect((await stat(join(outside, 'keep.txt'))).size).toBe(4);
  });

  it('RF-005 refuses a snapshot that is a link and leaves the folder it points to', async () => {
    const outside = join(data.path, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'keep.txt'), 'kept');
    await mkdir(join(data.path, 'sources'), { recursive: true });
    const key = `octo__linked@${snapshotSha}`;
    await symlink(outside, join(data.path, 'sources', key), 'junction');

    const removed = await new FileSnapshotCache(data.path).remove(key);

    expect(removed).toBe(false);
    expect((await stat(join(outside, 'keep.txt'))).size).toBe(4);
  });
});
