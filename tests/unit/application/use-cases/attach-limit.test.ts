import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { amy as zipper, request, setup } from '../../../support/store-upload-harness.js';
import { amy, batchCase, fileRequest } from '../../../support/workbook-batch-harness.js';

// RF-159, DEC-183: the attach of a source has a time limit, so a Cancel that waits for it cannot hang.
// The batch then ends refused with the code of a time bound (RST-1918); the project stays busy until the attach settles.

const LIMIT_MS = 40;
const never = (): Promise<never> => new Promise<never>(() => undefined);

describe('WorkbookBatches an attach that never ends', () => {
  it('RF-159 ends the batch refused with the time-bound code, and a waiting Cancel is answered', async () => {
    const world = await batchCase(undefined, { attachTimeoutMs: LIMIT_MS });
    const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
    if (!opened.ok) throw new Error('open refused');
    const { batchId } = opened.value;
    await world.useCase.receive(fileRequest(world.project, batchId));
    const attaching = vi.spyOn(world.projects, 'attachUpload').mockImplementation(never);
    const ref = { actor: amy, projectId: world.project.id, batchId };
    await world.useCase.finish({ ...ref, ip: '203.0.113.7' });
    await vi.waitFor(() => {
      expect(attaching).toHaveBeenCalledTimes(1);
    });

    const cancelled = await world.useCase.cancel(ref);

    expect(cancelled).toMatchObject({
      ok: true,
      value: { cancelled: false, state: { batchId, phase: 'refused' } },
    });
    const refusal = cancelled.ok && !cancelled.value.cancelled && cancelled.value.state.refusal;
    expect(refusal).toBeInstanceOf(RosettaError);
    expect(refusal).toMatchObject({ code: ERROR_CODES.uploadTimedOut });
    // The attach has not settled: the project stays busy until it does (late-attach.test.ts).
    expect(await world.useCase.open({ actor: amy, projectId: world.project.id })).toMatchObject({
      ok: false,
      error: ERROR_CODES.uploadInProgress,
    });
  });
});

describe('StoreUpload an attach that never ends', () => {
  it('RF-159 ends the batch of the zip refused with the time-bound code', async () => {
    const world = await setup(undefined, { attachTimeoutMs: LIMIT_MS });
    world.uploads.held = { entries: [], lines: [], leftOut: [] };
    world.uploads.announcesWorkbooks = true;
    const attaching = vi.spyOn(world.projects, 'attachUpload').mockImplementation(never);
    const outcome = await world.useCase.execute(request(world.project));
    if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('the zip was not accepted');
    const { batchId } = outcome.value.accepted;
    await vi.waitFor(() => {
      expect(attaching).toHaveBeenCalledTimes(1);
    });

    const cancelled = await world.batches.cancel({
      ...{ actor: zipper, projectId: world.project.id, batchId },
    });

    expect(cancelled).toMatchObject({
      ok: true,
      value: { cancelled: false, state: { phase: 'refused' } },
    });
    const refusal = cancelled.ok && !cancelled.value.cancelled && cancelled.value.state.refusal;
    expect(refusal).toMatchObject({ code: ERROR_CODES.uploadTimedOut });
    // The attach may still end well, so the snapshot it names is not removed.
    expect(world.uploads.removed).toEqual([]);
  });
});
