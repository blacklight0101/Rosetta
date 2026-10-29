import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { workbookSnapshotKey } from '../../../../src/domain/sources/workbook-key.js';
import { amy as zipper, request, setup } from '../../../support/store-upload-harness.js';
import {
  amy,
  batchCase,
  fileRequest,
  finishAndWait,
  workbookProject,
} from '../../../support/workbook-batch-harness.js';

// RF-128, RF-133, RF-159, DEC-183, DEC-188: the steps after the source was attached (the earlier
// snapshot going, the new one named, the audit rows) are best effort. When one of them fails the source
// is attached, so the batch ends stored and the step is logged; it never ends refused.

const counts = { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 };
const entry = {
  fileName: 'Pricing.xlsx',
  folder: 'Pricing.xlsx',
  sizeBytes: 2048,
  sha256: `sha256:${'12'.repeat(32)}`,
  counts,
};
const line = { name: 'Pricing.xlsx', sheets: 2, cells: 30, formulas: 4, macroModules: 0 };

const steps = [
  'the audit rows',
  'the rename of the snapshot',
  'the removal of the earlier snapshot',
];

async function started(world: Awaited<ReturnType<typeof batchCase>>) {
  const opened = await world.useCase.open({ actor: amy, projectId: world.project.id });
  if (!opened.ok) throw new Error('open refused');
  await world.useCase.receive(fileRequest(world.project, opened.value.batchId));
  return {
    ...{ actor: amy, projectId: world.project.id, batchId: opened.value.batchId },
    ip: '203.0.113.7',
  };
}

describe.each(steps)('WorkbookBatches %s fails after the attach', (step) => {
  it('RF-159 ends the batch stored, keeps the source and logs the step', async () => {
    const earlier = 'workbook__earlier@0000000000000000';
    const project = workbookProject({
      upload: { fileName: 'Old.xlsx', uploadedAt: 1, snapshotKey: earlier, workbooks: 1 },
    });
    const world = await batchCase(project);
    const request = await started(world);
    const down = new Error('step down');
    if (step === 'the audit rows') vi.spyOn(world.auditLog, 'record').mockRejectedValue(down);
    if (step === 'the rename of the snapshot') {
      vi.spyOn(world.uploads, 'rewriteInfo').mockRejectedValue(down);
      world.staging.existing.add(keyOf(world.project.id));
    }
    if (step === 'the removal of the earlier snapshot') {
      vi.spyOn(world.runs, 'list').mockRejectedValue(down);
    }

    const done = await finishAndWait(world, request);

    expect(done.ok).toBe(true);
    const row = await world.projects.find(amy.userId, world.project.id);
    expect(row?.upload?.snapshotKey).not.toBe(earlier);
    expect(world.logger.entries.some((entry) => entry.level === 'error')).toBe(true);
    expect(world.logger.text()).toContain('after the source was attached');
  });
});

/** The key the fake staging area gives a batch holding Pricing.xlsx: the hash of the file names. */
function keyOf(projectId: string): string {
  const hash = `sha256:${createHash('sha256').update('Pricing.xlsx').digest('hex')}`;
  return workbookSnapshotKey(projectId, hash);
}

describe('StoreUpload the audit row fails after the attach', () => {
  it('RF-133 a zip with workbooks ends its batch stored and logs the step', async () => {
    const world = await setup();
    world.uploads.held = { entries: [entry], lines: [line], leftOut: [] };
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

    const row = await world.projects.find(zipper.userId, world.project.id);
    expect(row?.upload?.snapshotKey).toBeDefined();
    expect(world.logger.text()).toContain('after the source was attached');
  });

  it('RF-133 a zip without workbooks answers its summary', async () => {
    const world = await setup();
    vi.spyOn(world.auditLog, 'record').mockRejectedValue(new Error('audit down'));

    const outcome = await world.useCase.execute(request(world.project));

    expect(outcome.ok).toBe(true);
    expect(world.logger.text()).toContain('after the source was attached');
  });
});
