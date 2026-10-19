import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileSnapshotCache } from '../../../../src/infrastructure/files/file-snapshot-cache.js';
import {
  UPLOAD_KEY,
  uploadRecord,
  WORKBOOK_HASH,
  WORKBOOK_KEY,
  workbookRecord,
} from '../../../support/workbook-source-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-1012, RF-152, data-model.md section 3.3: the administrator's snapshot list reads the workbook
// kind of `snapshot.json` too, so a rendered workbook snapshot is listed and removable like the
// others, and a folder whose name and record disagree about the kind is neither.

const data = useWritableTempRoot('rosetta-workbook-cache-');

async function place(key: string, record: unknown): Promise<void> {
  const folder = join(data.path, 'sources', key);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'snapshot.json'), JSON.stringify(record), 'utf8');
}

describe('FileSnapshotCache with workbooks', () => {
  it('RF-1012 lists a workbook snapshot with its hash, upload instant and counts', async () => {
    await place(WORKBOOK_KEY, workbookRecord);

    const listed = await new FileSnapshotCache(data.path).list();

    expect(listed).toEqual([
      {
        key: WORKBOOK_KEY,
        repository: 'Excel workbooks',
        commitSha: WORKBOOK_HASH,
        downloadedAt: '2026-10-19T08:00:00.000Z',
        fileCount: 9,
        totalBytes: 5120,
      },
    ]);
  });

  it('RF-1012 removes a workbook snapshot', async () => {
    await place(WORKBOOK_KEY, workbookRecord);
    const cache = new FileSnapshotCache(data.path);

    expect(await cache.remove(WORKBOOK_KEY)).toBe(true);

    expect(await cache.list()).toEqual([]);
  });

  it('RF-152 does not list a workbook record under an upload key', async () => {
    await place(UPLOAD_KEY, workbookRecord);

    expect(await new FileSnapshotCache(data.path).list()).toEqual([]);
  });

  it('RF-152 does not list an upload record under a workbook key', async () => {
    await place(WORKBOOK_KEY, uploadRecord);

    expect(await new FileSnapshotCache(data.path).list()).toEqual([]);
  });

  it('RF-1012 neither lists nor removes a name that is not a workbook snapshot key', async () => {
    const odd = 'workbook__not-a-uuid@0123456789abcdef';
    await place(odd, workbookRecord);
    const cache = new FileSnapshotCache(data.path);

    expect(await cache.list()).toEqual([]);
    expect(await cache.remove(odd)).toBe(false);
  });
});
