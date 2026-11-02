import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { workbookBatch, zipBatch } from '../../../support/late-attach-harness.js';

// RF-159, DEC-188: the attach lands while the RST-1918 refusal is still being written (the log of the
// refusal is slow). The refusal must not overwrite the correction: the batch ends stored, and the project
// is free.

describe.each([
  ['WorkbookBatches', workbookBatch],
  ['StoreUpload', zipBatch],
])('%s the attach lands while the refusal is being written', (_name, start) => {
  it('RF-159 ends the batch stored, with the project free', async () => {
    const { world, ref, attach, open, batches } = await start();
    const { logger } = world;
    const log = logger.log.bind(logger);
    let letLogGo: () => void = () => undefined;
    const logGate = new Promise<void>((resolve) => {
      letLogGo = resolve;
    });
    let logHeld = false;
    vi.spyOn(logger, 'log').mockImplementation(async (record) => {
      if (record.code === ERROR_CODES.uploadTimedOut) {
        logHeld = true;
        await logGate;
      }
      return log(record);
    });
    await vi.waitFor(() => {
      expect(logHeld).toBe(true);
    });

    attach.release();
    await vi.waitFor(async () => {
      const row = await world.projects.find(ref.actor.userId, ref.projectId);
      expect(row?.upload?.snapshotKey).toBeDefined();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    letLogGo();
    // The refusal is written after the log: give it the time to be, then read what the batch says.
    await new Promise((resolve) => setTimeout(resolve, 30));

    await vi.waitFor(async () => {
      const read = await batches.state(ref);
      expect(read.ok && read.value.phase).toBe('stored');
    });
    await vi.waitFor(async () => {
      expect(await open()).toBe(true);
    });
  });
});
