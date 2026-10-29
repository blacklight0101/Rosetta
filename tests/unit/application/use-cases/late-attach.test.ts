import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { amy as zipper, request, setup } from '../../../support/store-upload-harness.js';
import { amy, batchCase, fileRequest } from '../../../support/workbook-batch-harness.js';

// RF-159, DEC-183, DEC-188: an attach that passes its time limit ends the batch refused (RST-1918) but
// keeps the project busy (RST-1919) until the attach settles. The state of the batch is then corrected
// from the project row: the attach landed, so the batch is stored; it did not, so it stays refused and a
// snapshot the batch created is removed. A batch never reads refused while its source is attached.

const LIMIT_MS = 40;
type Repository = Awaited<ReturnType<typeof batchCase>>['projects'];

/** `attachUpload` is held until `release`; it then does what the real one does, or fails. */
function held(projects: Repository, failure?: Error) {
  const real = projects.attachUpload.bind(projects);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(projects, 'attachUpload').mockImplementation(async (change) => {
    await gate;
    if (failure !== undefined) throw failure;
    return real(change);
  });
  return { release, spy };
}

async function workbookBatch(failure?: Error) {
  const world = await batchCase(undefined, { attachTimeoutMs: LIMIT_MS });
  const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
  if (!opened.ok) throw new Error('open refused');
  const { batchId } = opened.value;
  await world.useCase.receive(fileRequest(world.project, batchId));
  const attach = held(world.projects, failure);
  const ref = { actor: amy, projectId: world.project.id, batchId };
  await world.useCase.finish({ ...ref, ip: '203.0.113.7' });
  const open = async () =>
    (await world.useCase.open({ actor: amy, projectId: world.project.id })).ok;
  return { world, ref, attach, open, batches: world.useCase };
}

async function zipBatch(failure?: Error) {
  const world = await setup(undefined, { attachTimeoutMs: LIMIT_MS });
  world.uploads.held = { entries: [], lines: [], leftOut: [] };
  world.uploads.announcesWorkbooks = true;
  const attach = held(world.projects, failure);
  const outcome = await world.useCase.execute(request(world.project));
  if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('not accepted');
  const ref = {
    actor: zipper,
    projectId: world.project.id,
    batchId: outcome.value.accepted.batchId,
  };
  const open = () => world.batches.claim(world.project.id);
  return { world, ref, attach, open, batches: world.batches };
}

describe.each([
  ['WorkbookBatches', workbookBatch],
  ['StoreUpload', zipBatch],
])('%s an attach that passes its limit and ends later', (_name, start) => {
  it('RF-159 refuses first, keeps the project busy, and reads stored once the attach landed', async () => {
    const { world, ref, attach, open, batches } = await start();
    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('refused');
    });
    const refusal = await batches.state(ref);
    expect(refusal.ok && refusal.value.refusal).toMatchObject({ code: ERROR_CODES.uploadTimedOut });
    expect(await open()).toBe(false);

    attach.release();

    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('stored');
    });
    const row = await world.projects.find(ref.actor.userId, ref.projectId);
    expect(row?.upload?.snapshotKey).toBeDefined();
    expect(await open()).toBe(true);
  });

  it('RF-159 stays refused when the late attach failed, removes the snapshot it made and frees the project', async () => {
    const { world, ref, attach, open, batches } = await start(new Error('database gone'));
    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('refused');
    });
    const read = await batches.state(ref);
    expect(read.ok && read.value.refusal).toMatchObject({ code: ERROR_CODES.uploadTimedOut });
    expect(await open()).toBe(false);

    attach.release();

    await vi.waitFor(async () => {
      expect(await open()).toBe(true);
    });
    const row = await world.projects.find(ref.actor.userId, ref.projectId);
    expect(row?.upload).toBeUndefined();
    const { uploads } = world;
    expect(uploads.removed).toHaveLength(1);
  });
});
