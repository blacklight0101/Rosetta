import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { workbookBatch, zipBatch } from '../../../support/late-attach-harness.js';

// RF-159, DEC-183, DEC-188: an attach that passes its time limit ends the batch refused (RST-1918) but
// keeps the project busy (RST-1919) until the attach settles. The state of the batch is then corrected
// from the project row: the attach landed, so the batch is stored; it did not, so it stays refused and a
// snapshot the batch created is removed. A batch never reads refused while its source is attached.

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
    const { world, ref, attach, open, batches } = await start({ mode: 'fails' });
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

describe.each([
  ['WorkbookBatches', workbookBatch],
  ['StoreUpload', zipBatch],
])('%s a late attach that failed', (_name, start) => {
  it('RF-159 reads stored when the project row shows it committed before it failed', async () => {
    const { world, ref, attach, batches } = await start({ mode: 'fails-after-commit' });
    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('refused');
    });

    attach.release();

    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('stored');
    });
    const row = await world.projects.find(ref.actor.userId, ref.projectId);
    expect(row?.upload?.snapshotKey).toBeDefined();
    expect(world.uploads.removed).toEqual([]);
  });

  it('RF-159 removes nothing it did not create: a snapshot that was already stored stays', async () => {
    const { world, ref, attach, open, batches } = await start({
      ...{ mode: 'fails', existing: true },
    });
    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('refused');
    });

    attach.release();

    await vi.waitFor(async () => {
      expect(await open()).toBe(true);
    });
    expect(world.uploads.removed).toEqual([]);
  });
});
