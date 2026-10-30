import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { LogEntry } from '../../../../src/infrastructure/system/log-entry.js';
import { request, setup } from '../../../support/store-upload-harness.js';
import { amy, batchCase, fileRequest } from '../../../support/workbook-batch-harness.js';

// RF-158, RF-159: an attach that took longer than its limit ends the batch refused with RST-1918, and
// the operator reads it in the log, at error, with the id of the batch.

const LIMIT_MS = 40;
const timedOut = (entries: readonly LogEntry[], batchId: string): boolean =>
  entries.some(
    (entry) =>
      entry.level === 'error' &&
      entry.code === ERROR_CODES.uploadTimedOut &&
      entry.data?.['batchId'] === batchId,
  );
const never = (): Promise<never> => new Promise<never>(() => undefined);

describe('RST-1918 is logged', () => {
  it('RF-159 a workbook batch whose attach timed out is logged at error with its batch id', async () => {
    const world = await batchCase(undefined, { attachTimeoutMs: LIMIT_MS });
    const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
    if (!opened.ok) throw new Error('open refused');
    const { batchId } = opened.value;
    await world.useCase.receive(fileRequest(world.project, batchId));
    vi.spyOn(world.projects, 'attachUpload').mockImplementation(never);

    await world.useCase.finish({
      ...{ actor: amy, projectId: world.project.id, batchId, ip: '203.0.113.7' },
    });

    await vi.waitFor(() => {
      expect(timedOut(world.logger.entries, batchId)).toBe(true);
    });
  });

  it('RF-159 a zip whose attach timed out is logged at error with its batch id', async () => {
    const world = await setup(undefined, { attachTimeoutMs: LIMIT_MS });
    world.uploads.held = { entries: [], lines: [], leftOut: [] };
    world.uploads.announcesWorkbooks = true;
    vi.spyOn(world.projects, 'attachUpload').mockImplementation(never);

    const outcome = await world.useCase.execute(request(world.project));
    if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('not accepted');
    const { batchId } = outcome.value.accepted;

    await vi.waitFor(() => {
      expect(timedOut(world.logger.entries, batchId)).toBe(true);
    });
  });
});
