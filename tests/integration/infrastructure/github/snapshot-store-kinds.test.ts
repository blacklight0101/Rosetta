import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SnapshotInfo } from '../../../../src/application/ports/source-fetcher.js';
import { sourceKindOf } from '../../../../src/domain/sources/source-kind.js';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import { FIXTURE_SHA } from '../../../support/snapshot-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-130, RF-126, RFC-004 section 4.1, data-model.md section 3.3: `snapshot.json` has two kinds. A
// record without `kind` is a GitHub one (every record written before uploads existed); an upload
// record carries `kind`, `fileName` and `uploadedAt` and none of the GitHub fields.

const root = useWritableTempRoot('rosetta-store-kinds-');
const githubKey = `octo__demo@${FIXTURE_SHA}`;
const uploadKey = 'upload__00000000-0000-4000-a000-000000000001@0123456789abcdef';
const HASH = `sha256:${'a'.repeat(64)}`;

const oldRecord = {
  schemaVersion: 1,
  url: 'https://github.com/Octo/Demo',
  owner: 'Octo',
  repo: 'Demo',
  commitSha: FIXTURE_SHA,
  resolvedFrom: 'main',
  downloadedAt: '2026-10-11T09:05:03.007Z',
  fileCount: 4,
  totalBytes: 157,
  skippedLinks: 0,
  snapshotHash: HASH,
  licence: 'MIT',
};

const uploadRecord = {
  schemaVersion: 1,
  kind: 'upload',
  fileName: 'OrderDesk.zip',
  uploadedAt: '2026-10-19T08:00:00.000Z',
  fileCount: 12,
  totalBytes: 3456,
  skippedLinks: 2,
  snapshotHash: HASH,
};

const githubFields = {
  url: 'https://github.com/Octo/Demo',
  owner: 'Octo',
  repo: 'Demo',
  commitSha: FIXTURE_SHA,
  resolvedFrom: 'main',
  downloadedAt: '2026-10-11T09:05:03.007Z',
  licence: 'MIT',
};

function without(record: Record<string, unknown>, field: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== field));
}

async function place(key: string, record: unknown): Promise<SnapshotStore> {
  const store = new SnapshotStore(root.path);
  await mkdir(store.snapshotDir(key), { recursive: true });
  await writeFile(join(store.snapshotDir(key), 'snapshot.json'), JSON.stringify(record), 'utf8');
  return store;
}

describe('SnapshotStore reads the kind of a snapshot', () => {
  it('RF-130 a snapshot.json with no kind reads as a GitHub snapshot', async () => {
    const store = await place(githubKey, oldRecord);

    const snapshot = await store.readExisting(githubKey);

    expect(snapshot).toBeDefined();
    expect(sourceKindOf(snapshot ?? {})).toBe('github');
    expect(snapshot).toMatchObject({ owner: 'Octo', repo: 'Demo', commitSha: FIXTURE_SHA });
    expect(snapshot).not.toHaveProperty('kind', 'upload');
  });

  it('RF-130 a snapshot.json that says kind github reads as a GitHub snapshot', async () => {
    const store = await place(githubKey, { ...oldRecord, kind: 'github' });

    const snapshot = await store.readExisting(githubKey);

    expect(sourceKindOf(snapshot ?? {})).toBe('github');
    expect(snapshot).toMatchObject({ owner: 'Octo', commitSha: FIXTURE_SHA });
  });

  it('RF-130 an upload record reads with its file name, upload instant, counts and hash', async () => {
    const store = await place(uploadKey, uploadRecord);

    const snapshot = await store.readExisting(uploadKey);

    expect(snapshot).toEqual({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T08:00:00.000Z',
      fileCount: 12,
      totalBytes: 3456,
      skippedLinks: 2,
      snapshotHash: HASH,
      key: uploadKey,
      rootDir: store.filesDir(uploadKey),
      cached: true,
    });
  });

  it.each(Object.entries(githubFields))(
    'RF-130 an upload record that also holds the GitHub field %s is refused with RST-1906',
    async (field, value) => {
      const store = await place(uploadKey, { ...uploadRecord, [field]: value });

      await expect(store.readExisting(uploadKey)).rejects.toMatchObject({ code: 'RST-1906' });
    },
  );
});

describe('SnapshotStore refuses a damaged upload record', () => {
  it.each(['fileName', 'uploadedAt', 'snapshotHash', 'fileCount'])(
    'RF-130 an upload record without %s is refused with RST-1906',
    async (field) => {
      const store = await place(uploadKey, without(uploadRecord, field));

      await expect(store.readExisting(uploadKey)).rejects.toMatchObject({ code: 'RST-1906' });
    },
  );

  it('RF-130 an upload record with an empty file name is refused with RST-1906', async () => {
    const store = await place(uploadKey, { ...uploadRecord, fileName: '' });

    await expect(store.readExisting(uploadKey)).rejects.toMatchObject({ code: 'RST-1906' });
  });

  it('RF-130 a record of a kind that does not exist is refused with RST-1906', async () => {
    const store = await place(githubKey, { ...oldRecord, kind: 'folder' });

    await expect(store.readExisting(githubKey)).rejects.toMatchObject({ code: 'RST-1906' });
  });
});

describe('SnapshotStore writes the kind of a snapshot', () => {
  it('RF-126 a GitHub snapshot.json is written exactly as before, with no kind', async () => {
    const store = new SnapshotStore(root.path);
    await mkdir(store.snapshotDir(githubKey), { recursive: true });
    const info: SnapshotInfo = {
      url: 'https://github.com/Octo/Demo',
      owner: 'Octo',
      repo: 'Demo',
      commitSha: FIXTURE_SHA,
      resolvedFrom: 'main',
      downloadedAt: '2026-10-11T09:05:03.007Z',
      fileCount: 4,
      totalBytes: 157,
      skippedLinks: 0,
      snapshotHash: HASH,
      licence: 'MIT',
    };

    await store.writeInfo(store.snapshotDir(githubKey), info);

    const text = await readFile(join(store.snapshotDir(githubKey), 'snapshot.json'), 'utf8');
    expect(text).toBe(`${JSON.stringify(oldRecord, null, 2)}\n`);
  });

  it('RF-130 an upload snapshot.json holds kind upload, the file name and the upload instant', async () => {
    const store = new SnapshotStore(root.path);
    await mkdir(store.snapshotDir(uploadKey), { recursive: true });
    const info: SnapshotInfo = {
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T08:00:00.000Z',
      fileCount: 12,
      totalBytes: 3456,
      skippedLinks: 2,
      snapshotHash: HASH,
    };

    await store.writeInfo(store.snapshotDir(uploadKey), info);

    const written: unknown = JSON.parse(
      await readFile(join(store.snapshotDir(uploadKey), 'snapshot.json'), 'utf8'),
    );
    expect(written).toEqual(uploadRecord);
    expect(await store.readExisting(uploadKey)).toMatchObject({ kind: 'upload', fileCount: 12 });
  });
});

describe('SnapshotStore.rewriteInfo when the write fails', () => {
  it('RF-128 leaves the description file and its folder read-only again', async () => {
    class FailingStore extends SnapshotStore {
      override writeInfo(): Promise<void> {
        return Promise.reject(new Error('disk full'));
      }
    }
    const store = new FailingStore(root.path);
    const dir = store.snapshotDir(uploadKey);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'snapshot.json'), '{}', 'utf8');
    await new SnapshotStore(root.path).makeReadOnly(dir);

    const failed = store.rewriteInfo(uploadKey, {
      kind: 'upload',
      fileName: 'New.zip',
      uploadedAt: '2026-10-20T09:00:00.000Z',
      fileCount: 1,
      totalBytes: 1,
      skippedLinks: 0,
      snapshotHash: HASH,
    });

    await expect(failed).rejects.toThrow();
    expect((await stat(join(dir, 'snapshot.json'))).mode & 0o222).toBe(0);
    // Windows has no read-only folders; the mode of a folder says nothing there.
    expect(process.platform === 'win32' ? 0 : (await stat(dir)).mode & 0o222).toBe(0);
  });
});
