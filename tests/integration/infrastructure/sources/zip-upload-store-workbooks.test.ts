import { afterEach, describe, expect, it } from 'vitest';
import {
  bodyOf,
  otherProjectId,
  requestOf,
  sampleZip,
  storeIn,
} from '../../../support/upload-store-harness.js';
import {
  projectId,
  sampleBook,
  sourcesOf,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';

// RF-152, RF-133, RF-1012: the store of sent sources reads, removes and removes by project the
// snapshots of workbooks as it does those of zips.

const folders = useStagingFolders(afterEach);

async function published(
  setup: Awaited<ReturnType<typeof folders>>,
  forProject = projectId,
): Promise<string> {
  const { id } = await stageFiles(setup.staging, [['Pricing.xlsx', await sampleBook()]]);
  const signal = new AbortController().signal;
  return (await setup.staging.publish(id, { projectId: forProject, uploadedAt, signal })).key;
}

describe('ZipUploadStore and workbook snapshots', () => {
  it('RF-152 reads the snapshot of a workbook key as a workbook snapshot', async () => {
    const setup = await folders();
    const key = await published(setup);

    const snapshot = await storeIn(setup.dataDir).read(key);

    expect(snapshot).toMatchObject({ kind: 'workbook', key, rendererVersion: '2' });
    expect(snapshot?.rootDir).toContain(key);
  });

  it('RF-152 reads nothing for a workbook key that is not stored, or for a key of no kind', async () => {
    const { dataDir } = await folders();
    const store = storeIn(dataDir);

    expect(await store.read(`workbook__${projectId}@0123456789abcdef`)).toBeUndefined();
    expect(await store.read('../outside')).toBeUndefined();
  });

  it('RF-1012 removes one workbook snapshot, once', async () => {
    const setup = await folders();
    const key = await published(setup);
    const store = storeIn(setup.dataDir);

    const first = await store.remove(key);
    const second = await store.remove(key);

    expect([first, second]).toEqual([true, false]);
    expect(await sourcesOf(setup.dataDir)).toEqual([]);
  });

  it('RF-133 removes every snapshot of a project, zips and workbooks, and no other project', async () => {
    const setup = await folders();
    const store = storeIn(setup.dataDir);
    const mine = await published(setup);
    const zip = await store.store(requestOf(bodyOf(await sampleZip()), { projectId }));
    const theirs = await published(setup, otherProjectId);

    const removed = await store.removeAllOf(projectId);

    expect(removed).toBe(2);
    expect(await sourcesOf(setup.dataDir)).toEqual([theirs]);
    expect([mine, zip.key]).not.toContain(theirs);
  });
});
