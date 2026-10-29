import { describe, expect, it } from 'vitest';
import type { Project } from '../../../../src/application/projects/project.js';
import { uploadSnapshotKey } from '../../../../src/domain/sources/upload-name.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { amy, request, setup, uploadProject } from '../../../support/store-upload-harness.js';

// RF-128, RF-159, DEC-188: a zip whose content is already stored names a snapshot this upload did not
// create. A Cancel never deletes it and never rewrites its description; only an upload that becomes
// the source names it.

const counts = { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 };
const entry = {
  fileName: 'Pricing.xlsx',
  folder: 'Pricing.xlsx',
  sizeBytes: 2048,
  sha256: `sha256:${'12'.repeat(32)}`,
  counts,
};
const line = { name: 'Pricing.xlsx', sheets: 2, cells: 30, formulas: 4, macroModules: 0 };
const otherHash = `sha256:${'cd'.repeat(32)}`;

type Case = Awaited<ReturnType<typeof setup>>;

/** The zip holds workbooks and the store is held open until the returned call. */
function holding(uploads: Case['uploads']): () => void {
  uploads.held = { entries: [entry], lines: [line], leftOut: [] };
  uploads.announcesWorkbooks = true;
  let release: () => void = () => undefined;
  uploads.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

async function batchOf(world: Case, project: Project): Promise<string> {
  const outcome = await world.useCase.execute(request(project));
  if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('the zip was not accepted');
  return outcome.value.accepted.batchId;
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** A project whose source is the snapshot `key`, which is on disk. */
async function withSource(id: string, hash: (world: Case) => string) {
  const probe = await setup();
  const key = uploadSnapshotKey(id, hash(probe));
  const project = uploadProject({
    id,
    upload: { fileName: 'Old.zip', uploadedAt: 1, snapshotKey: key },
  });
  const world = await setup(project);
  world.uploads.existing.add(key);
  return { world, project, key };
}

describe('StoreUpload a late Cancel of a zip whose content is already stored', () => {
  it('RF-159 keeps the source of the project and its description: the same content uploaded again', async () => {
    const id = '00000000-0000-4000-a000-0000000000e1';
    const { world, project, key } = await withSource(id, (probe) => probe.uploads.hash);
    const release = holding(world.uploads);
    const batchId = await batchOf(world, project);

    await world.batches.cancel({ actor: amy, projectId: project.id, batchId });
    release();
    await settle();

    expect(world.uploads.removed).toEqual([]);
    expect(world.uploads.renamed).toEqual([]);
    expect((await world.projects.find(amy.userId, project.id))?.upload).toMatchObject({
      fileName: 'Old.zip',
      snapshotKey: key,
    });
  });

  it('RF-128 keeps an earlier zip a run still uses, whose content is uploaded again', async () => {
    const id = '00000000-0000-4000-a000-0000000000e2';
    const { world, project, key } = await withSource(id, () => otherHash);
    const used = uploadSnapshotKey(id, world.uploads.hash);
    world.uploads.existing.add(used);
    await world.runs.insert(
      sampleRun({
        ...{ projectId: project.id, userId: amy.userId, snapshotKey: used },
        ...{ queueState: 'Ended', endState: 'Completed' },
      }),
    );
    const release = holding(world.uploads);
    const batchId = await batchOf(world, project);

    await world.batches.cancel({ actor: amy, projectId: project.id, batchId });
    release();
    await settle();

    expect(world.uploads.removed).toEqual([]);
    expect(world.uploads.renamed).toEqual([]);
    expect((await world.projects.find(amy.userId, project.id))?.upload?.snapshotKey).toBe(key);
  });
});

describe('StoreUpload a late Cancel of a zip whose content is new', () => {
  it('RF-159 still deletes the snapshot a cancelled upload created itself', async () => {
    const id = '00000000-0000-4000-a000-0000000000e3';
    const { world, project, key } = await withSource(id, () => otherHash);
    const release = holding(world.uploads);
    const batchId = await batchOf(world, project);

    await world.batches.cancel({ actor: amy, projectId: project.id, batchId });
    release();
    await settle();

    expect(world.uploads.removed).toEqual([uploadSnapshotKey(id, world.uploads.hash)]);
    expect((await world.projects.find(amy.userId, project.id))?.upload?.snapshotKey).toBe(key);
  });
});

describe('StoreUpload the same content uploaded again and kept', () => {
  it('RF-128 names the snapshot after the newest upload once it is the source, in the background', async () => {
    const id = '00000000-0000-4000-a000-0000000000e4';
    const { world, project, key } = await withSource(id, (probe) => probe.uploads.hash);
    const release = holding(world.uploads);
    await batchOf(world, project);

    release();
    await settle();

    expect(world.uploads.renamed).toEqual([key]);
    expect(world.uploads.removed).toEqual([]);
    expect((await world.projects.find(amy.userId, project.id))?.upload).toMatchObject({
      fileName: 'OrderDesk.zip',
      snapshotKey: key,
    });
  });

  it('RF-128 names the snapshot after the newest upload inside the request too', async () => {
    const id = '00000000-0000-4000-a000-0000000000e5';
    const { world, project, key } = await withSource(id, (probe) => probe.uploads.hash);

    const outcome = await world.useCase.execute(request(project));

    expect(outcome.ok).toBe(true);
    expect(world.uploads.renamed).toEqual([key]);
  });

  it('RF-128 a new snapshot needs no new name', async () => {
    const { useCase, project, uploads } = await setup();

    await useCase.execute(request(project));

    expect(uploads.renamed).toEqual([]);
  });
});
