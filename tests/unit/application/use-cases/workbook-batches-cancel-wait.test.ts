import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { amy as zipper, request, setup } from '../../../support/store-upload-harness.js';
import { amy, batchCase, fileRequest } from '../../../support/workbook-batch-harness.js';

// RF-159: a Cancel answers when the work it stopped has cleaned up. Until then the project is busy, so
// a new upload cannot be accepted while the old work may still delete a snapshot the new one attaches.

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** A gate a test opens later. */
function gate(): { readonly wait: Promise<void>; readonly open: () => void } {
  let open: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    wait,
    open: () => {
      open();
    },
  };
}

describe('WorkbookBatches a Cancel whose work is still deleting its snapshot', () => {
  it('RF-159 answers after the deletion, and refuses a new batch until then', async () => {
    const world = await batchCase();
    const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
    if (!opened.ok) throw new Error('open refused');
    const { batchId } = opened.value;
    await world.useCase.receive(fileRequest(world.project, batchId));
    const publishing = gate();
    const deleting = gate();
    world.staging.endsAfterAbort = true;
    world.staging.duringPublish = () => publishing.wait;
    world.uploads.removeGate = deleting.wait;
    const ref = { actor: amy, projectId: world.project.id, batchId };
    await world.useCase.finish({ ...ref, ip: '203.0.113.7' });
    await vi.waitFor(() => {
      expect(world.staging.published).toEqual([batchId]);
    });
    let answered = false;
    const cancelling = world.useCase.cancel(ref).then((outcome) => {
      answered = true;
      return outcome;
    });
    await settle();
    publishing.open();
    await vi.waitFor(() => {
      expect(world.uploads.removed).toHaveLength(1);
    });

    const during = await world.useCase.open({ actor: amy, projectId: world.project.id });
    expect(during).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect(answered).toBe(false);

    deleting.open();
    expect(await cancelling).toEqual({ ok: true, value: { cancelled: true } });
    expect((await world.useCase.open({ actor: amy, projectId: world.project.id })).ok).toBe(true);
  });
});

describe('StoreUpload a Cancel whose work is still deleting its snapshot', () => {
  it('RF-159 answers after the deletion, and refuses a new zip until then', async () => {
    const world = await setup();
    world.uploads.held = { entries: [], lines: [], leftOut: [] };
    world.uploads.announcesWorkbooks = true;
    const storing = gate();
    const deleting = gate();
    world.uploads.gate = storing.wait;
    world.uploads.removeGate = deleting.wait;
    const outcome = await world.useCase.execute(request(world.project));
    if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('the zip was not accepted');
    const ref = {
      actor: zipper,
      projectId: world.project.id,
      batchId: outcome.value.accepted.batchId,
    };
    // The store ends as the Cancel lands, so the snapshot it made has to be deleted.
    let answered = false;
    const cancelling = world.batches.cancel(ref).then((result) => {
      answered = true;
      return result;
    });
    await settle();
    storing.open();
    await vi.waitFor(() => {
      expect(world.uploads.removed).toHaveLength(1);
    });

    const during = await world.useCase.execute(request(world.project));
    expect(during).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect(answered).toBe(false);

    deleting.open();
    expect(await cancelling).toEqual({ ok: true, value: { cancelled: true } });
    const later = await world.useCase.execute(request(world.project));
    expect(later.ok).toBe(true);
  });
});
