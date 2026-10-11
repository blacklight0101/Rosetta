import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import { FIXTURE_SHA } from '../../../support/snapshot-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-store-');
const key = `octo__demo@${FIXTURE_SHA}`;

async function partialWith(store: SnapshotStore, id: string, content: string): Promise<string> {
  const dir = store.partialDir(id);
  await mkdir(join(dir, 'files'), { recursive: true });
  await writeFile(join(dir, 'files', 'README.md'), content, 'utf8');
  return dir;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('SnapshotStore commit', () => {
  it('RF-122 renames the partial folder to its final name', async () => {
    const store = new SnapshotStore(root.path);
    const partial = await partialWith(store, 'one', 'first');

    expect(await store.commit(partial, key)).toBe(true);

    expect(await readdir(store.sourcesDir)).toEqual([key]);
    expect(await readFile(join(store.snapshotDir(key), 'files', 'README.md'), 'utf8')).toBe(
      'first',
    );
  });

  it('RF-122 a rename onto an existing snapshot deletes its own partial folder and keeps the existing one', async () => {
    const store = new SnapshotStore(root.path);
    await store.commit(await partialWith(store, 'one', 'first'), key);
    const second = await partialWith(store, 'two', 'second');

    expect(await store.commit(second, key)).toBe(false);

    expect(await readdir(store.sourcesDir)).toEqual([key]);
    expect(await readFile(join(store.snapshotDir(key), 'files', 'README.md'), 'utf8')).toBe(
      'first',
    );
  });
});

describe('SnapshotStore inspect', () => {
  it('RF-126 hashes the sorted path and content pairs and counts files and bytes', async () => {
    const store = new SnapshotStore(root.path);
    const files = join(root.path, 'files');
    await mkdir(join(files, 'b'), { recursive: true });
    await writeFile(join(files, 'b', 'two.txt'), 'two', 'utf8');
    await writeFile(join(files, 'a.txt'), 'a', 'utf8');
    const lines = `a.txt\0${sha256('a')}\nb/two.txt\0${sha256('two')}\n`;

    const summary = await store.inspect(files);

    expect(summary).toEqual({
      fileCount: 2,
      totalBytes: 4,
      snapshotHash: `sha256:${sha256(lines)}`,
    });
  });

  it('RF-122 reports an empty tree as zero files with a stable hash', async () => {
    const store = new SnapshotStore(root.path);
    const files = join(root.path, 'files');
    await mkdir(files);

    expect(await store.inspect(files)).toEqual({
      fileCount: 0,
      totalBytes: 0,
      snapshotHash: `sha256:${sha256('')}`,
    });
  });
});
