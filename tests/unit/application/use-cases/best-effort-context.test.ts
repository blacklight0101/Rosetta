import { describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../../../../src/infrastructure/system/log-entry.js';
import { amy as zipper, request, setup } from '../../../support/store-upload-harness.js';
import {
  amy,
  batchCase,
  fileRequest,
  finishAndWait,
} from '../../../support/workbook-batch-harness.js';

// RF-133, RF-159: a step after the attach that failed is logged with what an operator needs to trace it
// and to rebuild it: the step, the project, the batch and the snapshot.

const skipped = (entries: readonly LogEntry[]): LogEntry | undefined =>
  entries.find((entry) => entry.message.includes('best effort'));

describe('the log of a best-effort step that failed', () => {
  it('RF-133 names the step, the project, the batch and the snapshot (workbooks)', async () => {
    const world = await batchCase();
    vi.spyOn(world.auditLog, 'record').mockRejectedValue(new Error('audit down'));
    const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
    if (!opened.ok) throw new Error('open refused');
    const { batchId } = opened.value;
    await world.useCase.receive(fileRequest(world.project, batchId));

    const done = await finishAndWait(world, {
      ...{ actor: amy, projectId: world.project.id, batchId, ip: '203.0.113.7' },
    });

    expect(done.ok).toBe(true);
    const entry = skipped(world.logger.entries);
    expect(entry?.level).toBe('error');
    expect(entry?.message).toContain('the audit rows');
    const data = { ...entry?.data };
    expect(data).toMatchObject({ projectId: world.project.id, batchId, reason: 'audit down' });
    expect(JSON.stringify(data)).toContain('workbook__');
  });

  it('RF-133 names the step, the project, the batch and the snapshot (zip)', async () => {
    const world = await setup();
    world.uploads.held = { entries: [], lines: [], leftOut: [] };
    world.uploads.announcesWorkbooks = true;
    vi.spyOn(world.auditLog, 'record').mockRejectedValue(new Error('audit down'));

    const outcome = await world.useCase.execute(request(world.project));
    if (!outcome.ok || !('accepted' in outcome.value)) throw new Error('not accepted');
    const { batchId } = outcome.value.accepted;
    const ref = { actor: zipper, projectId: world.project.id, batchId };
    await vi.waitFor(async () => {
      const read = await world.batches.state(ref);
      expect(read.ok && read.value.phase).toBe('stored');
    });

    const data = { ...skipped(world.logger.entries)?.data };
    expect(data).toMatchObject({ projectId: world.project.id, batchId });
    expect(JSON.stringify(data)).toContain('upload__');
  });
});
