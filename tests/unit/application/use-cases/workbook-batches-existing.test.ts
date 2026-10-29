import { describe, expect, it, vi } from 'vitest';
import { workbookSnapshotKey } from '../../../../src/domain/sources/workbook-key.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import {
  amy,
  batchCase,
  fileRequest,
  finishAndWait,
  workbookProject,
  type BatchCase,
} from '../../../support/workbook-batch-harness.js';

// RF-159, RF-128, DEC-183: a batch of workbooks whose content is already stored names a snapshot this
// batch did not create. A Cancel, a deleted project or a failure never deletes it and never rewrites
// its description; only a batch that becomes the source names it.

const id = '00000000-0000-4000-a000-0000000000f1';
const otherHash = `sha256:${'cd'.repeat(32)}`;
const request = (world: BatchCase, batchId: string) => ({
  ...{ actor: amy, projectId: world.project.id, batchId, ip: '203.0.113.7' },
});

async function opened(world: BatchCase): Promise<string> {
  const outcome = await world.useCase.open({ actor: amy, projectId: world.project.id });
  if (!outcome.ok) throw new Error(`open refused: ${outcome.error}`);
  await world.useCase.receive(fileRequest(world.project, outcome.value.batchId));
  return outcome.value.batchId;
}

/** The key a batch holding Pricing.xlsx gets in the fake staging area. */
async function pricingKey(): Promise<string> {
  const probe = await batchCase(workbookProject({ id }));
  const done = await finishAndWait(probe, request(probe, await opened(probe)));
  if (!done.ok) throw new Error('the probe batch was refused');
  return workbookSnapshotKey(id, done.value.snapshotHash);
}

/** A project whose source is the snapshot `source`, which is on disk, as is `pricing`. */
async function withSource(source: string, pricing: string) {
  const project = workbookProject({
    id,
    upload: { fileName: 'Old.xlsx', uploadedAt: 1, snapshotKey: source, workbooks: 1 },
  });
  const world = await batchCase(project);
  world.staging.existing.add(source);
  world.staging.existing.add(pricing);
  return { world, project };
}

/** The finish is held at the publish, so a test can act while the work is under way. */
async function holding(world: BatchCase) {
  const batchId = await opened(world);
  let release: () => void = () => undefined;
  world.staging.duringPublish = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  world.staging.endsAfterAbort = true;
  await world.useCase.finish(request(world, batchId));
  await vi.waitFor(() => {
    expect(world.staging.published).toEqual([batchId]);
  });
  return {
    batchId,
    release: () => {
      release();
    },
  };
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function cancelAndRelease(world: BatchCase, held: { batchId: string; release: () => void }) {
  const cancelling = world.useCase.cancel({
    ...{ actor: amy, projectId: world.project.id, batchId: held.batchId },
  });
  await settle();
  held.release();
  await cancelling;
  await settle();
}

describe('WorkbookBatches a late Cancel of a batch whose content is already stored', () => {
  it('RF-159 keeps the source of the project: the same content uploaded again', async () => {
    const key = await pricingKey();
    const { world, project } = await withSource(key, key);
    const held = await holding(world);

    await cancelAndRelease(world, held);

    expect(world.uploads.removed).toEqual([]);
    expect(world.uploads.renamed).toEqual([]);
    expect((await world.projects.find(amy.userId, project.id))?.upload).toMatchObject({
      fileName: 'Old.xlsx',
      snapshotKey: key,
    });
  });

  it('RF-128 keeps an earlier snapshot a run still uses, whose content is uploaded again', async () => {
    const used = await pricingKey();
    const source = workbookSnapshotKey(id, otherHash);
    const { world, project } = await withSource(source, used);
    await world.runs.insert(
      sampleRun({
        ...{ projectId: project.id, userId: amy.userId, snapshotKey: used },
        ...{ queueState: 'Ended', endState: 'Completed' },
      }),
    );
    const held = await holding(world);

    await cancelAndRelease(world, held);

    expect(world.uploads.removed).toEqual([]);
    expect(world.uploads.renamed).toEqual([]);
    expect((await world.projects.find(amy.userId, project.id))?.upload?.snapshotKey).toBe(source);
  });
});

describe('WorkbookBatches a late Cancel of a batch whose content is new', () => {
  it('RF-159 still deletes the snapshot a cancelled batch created itself', async () => {
    const created = await pricingKey();
    const source = workbookSnapshotKey(id, otherHash);
    const { world, project } = await withSource(source, source);
    const held = await holding(world);

    await cancelAndRelease(world, held);

    expect(world.uploads.removed).toEqual([created]);
    expect((await world.projects.find(amy.userId, project.id))?.upload?.snapshotKey).toBe(source);
  });
});

describe('WorkbookBatches the project is deleted while the batch is read', () => {
  async function finishWithoutProject(world: BatchCase): Promise<void> {
    const batchId = await opened(world);
    world.staging.duringPublish = async () => {
      await world.projects.remove(amy.userId, world.project.id, () => Promise.resolve());
    };
    await world.useCase.finish(request(world, batchId));
    await settle();
  }

  it('RF-159 keeps a snapshot of the same content that was already stored', async () => {
    const key = await pricingKey();
    const { world } = await withSource(key, key);

    await finishWithoutProject(world);

    expect(world.uploads.removed).toEqual([]);
    expect(world.uploads.renamed).toEqual([]);
  });

  it('RF-159 deletes the snapshot the batch created, which has no owner', async () => {
    const created = await pricingKey();
    const other = workbookSnapshotKey(id, otherHash);
    const { world } = await withSource(other, other);

    await finishWithoutProject(world);

    expect(world.uploads.removed).toEqual([created]);
  });
});
describe('WorkbookBatches the same content uploaded again and kept', () => {
  it('RF-128 names the snapshot after the newest upload once it is the source', async () => {
    const key = await pricingKey();
    const { world, project } = await withSource(workbookSnapshotKey(id, otherHash), key);

    const done = await finishAndWait(world, request(world, await opened(world)));

    expect(done.ok).toBe(true);
    expect(world.uploads.renamed).toEqual([key]);
    expect(world.uploads.removed).toEqual([workbookSnapshotKey(id, otherHash)]);
    expect((await world.projects.find(amy.userId, project.id))?.upload?.snapshotKey).toBe(key);
  });

  it('RF-128 a new snapshot needs no new name', async () => {
    const world = await batchCase(workbookProject({ id }));

    await finishAndWait(world, request(world, await opened(world)));

    expect(world.uploads.renamed).toEqual([]);
  });
});
