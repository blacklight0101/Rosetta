import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSnapshotCache } from '../../../../src/infrastructure/files/file-snapshot-cache.js';
import {
  bodyOf,
  projectId,
  requestOf,
  sourcesEntries,
  storeIn,
} from '../../../support/upload-store-harness.js';
import { buildZip } from '../../../support/zip-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-1012, RF-130, data-model.md section 3.3: the administrator's snapshot list reads both kinds of
// `snapshot.json`, so an uploaded snapshot is listed and removable like a GitHub one.

const data = useWritableTempRoot('rosetta-upload-cache-');

async function storeSample(): Promise<string> {
  const zip = await buildZip([{ name: 'OrderDesk/a.cs', data: 'class A {}' }]);
  return (await storeIn(data.path).store(requestOf(bodyOf(zip)))).key;
}

describe('FileSnapshotCache with uploads', () => {
  it('RF-1012 lists an uploaded snapshot with its file name, hash and upload instant', async () => {
    const key = await storeSample();

    const listed = await new FileSnapshotCache(data.path).list();

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      key,
      repository: 'OrderDesk.zip (upload)',
      downloadedAt: '2026-10-19T08:00:00.000Z',
      fileCount: 1,
    });
    expect(listed[0]?.commitSha).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('RF-1012 removes an uploaded snapshot though its tree is read-only', async () => {
    const key = await storeSample();

    expect(await new FileSnapshotCache(data.path).remove(key)).toBe(true);

    expect(await sourcesEntries(data.path)).toEqual([]);
  });

  it('RF-1012 does not list or remove a folder named like an upload without a snapshot.json', async () => {
    const key = `upload__${projectId}@0123456789abcdef`;
    await mkdir(join(data.path, 'sources', key), { recursive: true });
    const cache = new FileSnapshotCache(data.path);

    expect(await cache.list()).toEqual([]);
    expect(await cache.remove(key)).toBe(true);
  });

  it('RF-1012 neither lists nor removes a name that is not a snapshot key', async () => {
    const odd = 'upload__not-a-uuid@0123456789abcdef';
    await mkdir(join(data.path, 'sources', odd), { recursive: true });
    await writeFile(join(data.path, 'sources', odd, 'snapshot.json'), '{}');
    const cache = new FileSnapshotCache(data.path);

    expect(await cache.list()).toEqual([]);
    expect(await cache.remove(odd)).toBe(false);
  });
});
