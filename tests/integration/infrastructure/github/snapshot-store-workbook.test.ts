import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SnapshotInfo } from '../../../../src/application/ports/source-fetcher.js';
import { sourceKindOf } from '../../../../src/domain/sources/source-kind.js';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import { FIXTURE_SHA } from '../../../support/snapshot-fixtures.js';
import {
  FILE_HASH,
  githubFields,
  UPLOAD_KEY,
  uploadRecord,
  WORKBOOK_HASH,
  WORKBOOK_KEY,
  workbookEntry,
  workbookRecord,
} from '../../../support/workbook-source-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-152, RF-130, RFC-005 sections 4.1 and 4.4, data-model.md section 3.3: `snapshot.json` has a
// third kind. A workbook record names its kind, the upload instant, the renderer version and one
// entry per workbook, and holds no GitHub field and no zip file name; an upload record may carry
// the same list of workbooks, and an empty list reads as none.

const root = useWritableTempRoot('rosetta-store-workbook-');
const githubKey = `octo__demo@${FIXTURE_SHA}`;

function without(record: Record<string, unknown>, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== field));
}

async function place(key: string, record: unknown): Promise<SnapshotStore> {
  const store = new SnapshotStore(root.path);
  await mkdir(store.snapshotDir(key), { recursive: true });
  await writeFile(join(store.snapshotDir(key), 'snapshot.json'), JSON.stringify(record), 'utf8');
  return store;
}

describe('SnapshotStore reads a workbook record', () => {
  it('RF-152 reads kind, upload instant, renderer version, workbooks, counts and hash', async () => {
    const store = await place(WORKBOOK_KEY, workbookRecord);

    const snapshot = await store.readExisting(WORKBOOK_KEY);

    expect(snapshot).toEqual({
      kind: 'workbook',
      uploadedAt: '2026-10-19T08:00:00.000Z',
      rendererVersion: '1',
      workbooks: [workbookEntry],
      fileCount: 9,
      totalBytes: 5120,
      skippedLinks: 0,
      snapshotHash: WORKBOOK_HASH,
      key: WORKBOOK_KEY,
      rootDir: store.filesDir(WORKBOOK_KEY),
      cached: true,
    });
    expect(sourceKindOf(snapshot ?? {})).toBe('workbook');
  });

  it.each(Object.entries(githubFields))(
    'RF-152 a workbook record that also holds the GitHub field %s is refused with RST-1906',
    async (field, value) => {
      const store = await place(WORKBOOK_KEY, { ...workbookRecord, [field]: value });

      await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
    },
  );
});

describe('SnapshotStore refuses a damaged workbook record', () => {
  it('RF-152 a workbook record that also holds the zip file name is refused with RST-1906', async () => {
    const store = await place(WORKBOOK_KEY, { ...workbookRecord, fileName: 'OrderDesk.zip' });

    await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });

  it.each(['uploadedAt', 'rendererVersion', 'workbooks', 'snapshotHash', 'fileCount'])(
    'RF-152 a workbook record without %s is refused with RST-1906',
    async (field) => {
      const store = await place(WORKBOOK_KEY, without(workbookRecord, field));

      await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
    },
  );

  it('RF-152 a workbook record with an empty renderer version is refused with RST-1906', async () => {
    const store = await place(WORKBOOK_KEY, { ...workbookRecord, rendererVersion: '' });

    await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });

  it('RF-152 a workbook record with no workbook at all is refused with RST-1906', async () => {
    const store = await place(WORKBOOK_KEY, { ...workbookRecord, workbooks: [] });

    await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });
});

describe('SnapshotStore refuses a damaged workbook entry', () => {
  const damaged: readonly (readonly [string, Record<string, unknown>])[] = [
    ['without a file name', without(workbookEntry, 'fileName')],
    ['with an empty file name', { ...workbookEntry, fileName: '' }],
    ['without a folder', without(workbookEntry, 'folder')],
    ['without a size', without(workbookEntry, 'sizeBytes')],
    ['with a negative size', { ...workbookEntry, sizeBytes: -1 }],
    ['without a SHA-256', without(workbookEntry, 'sha256')],
    ['with a SHA-256 that is not a hash', { ...workbookEntry, sha256: 'abc' }],
    ['without counts', without(workbookEntry, 'counts')],
    ['with a count missing', { ...workbookEntry, counts: { sheets: 1 } }],
    [
      'with a negative count',
      { ...workbookEntry, counts: { ...workbookEntry.counts, formulas: -1 } },
    ],
    [
      'with a count that is not a whole number',
      { ...workbookEntry, counts: { ...workbookEntry.counts, sheets: 1.5 } },
    ],
    [
      'with a count of a kind that does not exist',
      { ...workbookEntry, counts: { ...workbookEntry.counts, charts: 1 } },
    ],
    ['with a field it should not have', { ...workbookEntry, author: 'someone' }],
  ];

  it.each(damaged)('RF-152 an entry %s is refused with RST-1906', async (_what, entry) => {
    const store = await place(WORKBOOK_KEY, { ...workbookRecord, workbooks: [entry] });

    await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });
});

describe('SnapshotStore reads the workbooks of an upload record', () => {
  const withList = { ...uploadRecord, workbooks: [workbookEntry] };

  it('RF-152 an upload record reads the list of the workbooks its zip held', async () => {
    const store = await place(UPLOAD_KEY, withList);

    expect(await store.readExisting(UPLOAD_KEY)).toMatchObject({
      kind: 'upload',
      workbooks: [workbookEntry],
    });
  });

  it('RF-152 an upload record with an empty list reads the same as one without it', async () => {
    const empty = await (
      await place(UPLOAD_KEY, { ...uploadRecord, workbooks: [] })
    ).readExisting(UPLOAD_KEY);
    const absent = await (await place(UPLOAD_KEY, uploadRecord)).readExisting(UPLOAD_KEY);

    expect(empty).toEqual(absent);
    expect(empty).not.toHaveProperty('workbooks');
  });

  it('RF-152 an upload record without a list is exactly as on main', async () => {
    const store = await place(UPLOAD_KEY, uploadRecord);

    const snapshot = await store.readExisting(UPLOAD_KEY);

    expect(snapshot).toEqual({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T08:00:00.000Z',
      fileCount: 12,
      totalBytes: 3456,
      skippedLinks: 2,
      snapshotHash: WORKBOOK_HASH,
      key: UPLOAD_KEY,
      rootDir: store.filesDir(UPLOAD_KEY),
      cached: true,
    });
  });
});

describe('SnapshotStore refuses a damaged workbooks list of an upload record', () => {
  it('RF-152 an upload record whose list holds a damaged entry is refused with RST-1906', async () => {
    const store = await place(UPLOAD_KEY, {
      ...uploadRecord,
      workbooks: [{ ...workbookEntry, sha256: 'abc' }],
    });

    await expect(store.readExisting(UPLOAD_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });

  it('RF-152 an upload record that holds a renderer version is refused with RST-1906', async () => {
    const store = await place(UPLOAD_KEY, { ...uploadRecord, rendererVersion: '1' });

    await expect(store.readExisting(UPLOAD_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });
});

describe('SnapshotStore and the key of a workbook record', () => {
  it('RF-152 a key with the upload prefix is not read as a workbook: RST-1906', async () => {
    const store = await place(UPLOAD_KEY, workbookRecord);

    await expect(store.readExisting(UPLOAD_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });

  it('RF-152 a GitHub key is not read as a workbook: RST-1906', async () => {
    const store = await place(githubKey, workbookRecord);

    await expect(store.readExisting(githubKey)).rejects.toMatchObject({ code: 'RST-1906' });
  });

  it('RF-152 a workbook key does not hold an upload record: RST-1906', async () => {
    const store = await place(WORKBOOK_KEY, uploadRecord);

    await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });

  it('RF-152 a workbook key does not hold a GitHub record: RST-1906', async () => {
    const store = await place(WORKBOOK_KEY, {
      schemaVersion: 1,
      ...githubFields,
      fileCount: 1,
      totalBytes: 1,
      skippedLinks: 0,
      snapshotHash: WORKBOOK_HASH,
    });

    await expect(store.readExisting(WORKBOOK_KEY)).rejects.toMatchObject({ code: 'RST-1906' });
  });
});

describe('SnapshotStore writes a workbook record', () => {
  it('RF-152 writes kind workbook, the upload instant, the renderer version and the workbooks', async () => {
    const store = new SnapshotStore(root.path);
    await mkdir(store.snapshotDir(WORKBOOK_KEY), { recursive: true });
    const info: SnapshotInfo = {
      kind: 'workbook',
      uploadedAt: '2026-10-19T08:00:00.000Z',
      rendererVersion: '1',
      workbooks: [workbookEntry],
      fileCount: 9,
      totalBytes: 5120,
      skippedLinks: 0,
      snapshotHash: WORKBOOK_HASH,
    };

    await store.writeInfo(store.snapshotDir(WORKBOOK_KEY), info);

    const written: unknown = JSON.parse(
      await readFile(join(store.snapshotDir(WORKBOOK_KEY), 'snapshot.json'), 'utf8'),
    );
    expect(written).toEqual(workbookRecord);
    expect(await store.readExisting(WORKBOOK_KEY)).toMatchObject({
      kind: 'workbook',
      workbooks: [{ sha256: FILE_HASH }],
    });
  });
});
