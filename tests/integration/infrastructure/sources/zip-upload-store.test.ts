import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';
import {
  bodyOf,
  modeOf,
  otherProjectId,
  projectId,
  requestOf,
  sampleZip,
  sourcesEntries,
  storeIn,
} from '../../../support/upload-store-harness.js';
import { buildZip } from '../../../support/zip-fixtures.js';

// RF-128, RF-129, RF-130, RFC-004 section 4.2: the upload store over a real folder and the real
// extractor. Every failure leaves nothing in `<data>/sources/`.

const root = useWritableTempRoot('rosetta-upload-');

describe('ZipUploadStore a stored upload', () => {
  it('RF-130 publishes upload__<project>@<16 hex> with the tree, the record and no zip', async () => {
    const store = storeIn(root.path);

    const stored = await store.store(requestOf(bodyOf(await sampleZip())));

    expect(stored.key).toMatch(new RegExp(`^upload__${projectId}@[0-9a-f]{16}$`));
    expect(stored.key.slice(-16)).toBe(stored.info.snapshotHash.slice(7, 23));
    expect(await sourcesEntries(root.path)).toEqual([stored.key]);
    const folder = join(root.path, 'sources', stored.key);
    expect(await listTree(folder)).toEqual([
      'files/README.md',
      'files/src/Orders.cs',
      'snapshot.json',
    ]);
    const record: unknown = JSON.parse(await readFile(join(folder, 'snapshot.json'), 'utf8'));
    expect(record).toMatchObject({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T08:00:00.000Z',
      fileCount: 2,
      skippedLinks: 0,
      snapshotHash: stored.info.snapshotHash,
    });
    expect(stored.info).toMatchObject({ kind: 'upload', fileCount: 2 });
    expect(stored.zipBytes).toBe((await sampleZip()).length);
  });

  it('RF-130 leaves the tree read-only', async () => {
    const store = storeIn(root.path);

    const stored = await store.store(requestOf(bodyOf(await sampleZip())));

    const mode = await modeOf(join(root.path, 'sources', stored.key, 'files', 'README.md'));
    expect(mode & 0o222).toBe(0);
  });
});

describe('ZipUploadStore what is counted and kept', () => {
  it('RF-128 counts links, device names and left-out folders as skipped', async () => {
    const zip = await buildZip([
      { name: 'a.cs', data: 'a' },
      { name: 'node_modules/x/index.js', data: 'x' },
      { name: 'link', data: 'a.cs', mode: 0o120777 },
      { name: 'aux.c', data: 'c' },
    ]);

    const stored = await storeIn(root.path).store(requestOf(bodyOf(zip)));

    expect(stored.skipped).toBe(3);
    expect(stored.info.skippedLinks).toBe(2);
  });

  it('RF-130 the same content uploaded twice is one snapshot', async () => {
    const store = storeIn(root.path);

    const first = await store.store(requestOf(bodyOf(await sampleZip())));
    const second = await store.store(requestOf(bodyOf(await sampleZip())));

    expect(second.key).toBe(first.key);
    expect(await sourcesEntries(root.path)).toEqual([first.key]);
  });
});
describe('ZipUploadStore the same content stored again', () => {
  it('RF-128 the newest upload of the same content names the snapshot, and it stays read-only', async () => {
    const store = storeIn(root.path);
    const first = await store.store(requestOf(bodyOf(await sampleZip())));

    const second = await store.store(
      requestOf(bodyOf(await sampleZip()), {
        fileName: 'Renamed.zip',
        uploadedAt: '2026-10-20T09:00:00.000Z',
      }),
    );

    expect(second.info).toMatchObject({ fileName: 'Renamed.zip' });
    expect(await store.read(first.key)).toMatchObject({
      fileName: 'Renamed.zip',
      uploadedAt: '2026-10-20T09:00:00.000Z',
    });
    const mode = await modeOf(join(root.path, 'sources', first.key, 'snapshot.json'));
    expect(mode & 0o222).toBe(0);
  });

  it('RF-128 different content is a different snapshot and the first stays', async () => {
    const store = storeIn(root.path);
    const first = await store.store(requestOf(bodyOf(await sampleZip())));

    const changed = await buildZip([{ name: 'a.cs', data: 'changed' }]);
    const second = await store.store(requestOf(bodyOf(changed)));

    expect(second.key).not.toBe(first.key);
    expect(await sourcesEntries(root.path)).toEqual([first.key, second.key].sort());
  });
});

describe('ZipUploadStore the same content stored again, before it is kept', () => {
  it('RF-159 storing the same content again creates nothing and leaves the published snapshot as it was', async () => {
    const store = storeIn(root.path);
    const first = await store.store(requestOf(bodyOf(await sampleZip())));
    const before = await readFile(join(root.path, 'sources', first.key, 'snapshot.json'), 'utf8');

    const second = await store.store(
      requestOf(bodyOf(await sampleZip()), {
        fileName: 'Renamed.zip',
        uploadedAt: '2026-10-20T09:00:00.000Z',
      }),
    );

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ key: first.key, created: false });
    expect(second.info).toMatchObject({ fileName: 'Renamed.zip' });
    expect(await readFile(join(root.path, 'sources', first.key, 'snapshot.json'), 'utf8')).toBe(
      before,
    );
  });
});

describe('ZipUploadStore reading and removing', () => {
  it('RF-130 reads a stored snapshot back as an upload', async () => {
    const store = storeIn(root.path);
    const stored = await store.store(requestOf(bodyOf(await sampleZip())));

    const snapshot = await store.read(stored.key);

    expect(snapshot).toMatchObject({
      kind: 'upload',
      key: stored.key,
      fileName: 'OrderDesk.zip',
      rootDir: join(root.path, 'sources', stored.key, 'files'),
    });
  });

  it('RF-130 reads nothing for a key that is not there', async () => {
    expect(await storeIn(root.path).read(`upload__${projectId}@0123456789abcdef`)).toBeUndefined();
  });

  it('RF-130 refuses to read a key that is not an upload key', async () => {
    expect(await storeIn(root.path).read('../escape')).toBeUndefined();
  });

  it('RF-133 removes the snapshots of one project and no others', async () => {
    const store = storeIn(root.path);
    await store.store(requestOf(bodyOf(await sampleZip())));
    const changed = await buildZip([{ name: 'b.cs', data: 'b' }]);
    await store.store(requestOf(bodyOf(changed)));
    const other = await store.store(
      requestOf(bodyOf(await sampleZip()), { projectId: otherProjectId }),
    );

    const removed = await store.removeAllOf(projectId);

    expect(removed).toBe(2);
    expect(await sourcesEntries(root.path)).toEqual([other.key]);
  });

  it('RF-133 removes one snapshot by key and says so', async () => {
    const store = storeIn(root.path);
    const stored = await store.store(requestOf(bodyOf(await sampleZip())));

    expect(await store.remove(stored.key)).toBe(true);
    expect(await store.remove(stored.key)).toBe(false);
    expect(await sourcesEntries(root.path)).toEqual([]);
  });
});
