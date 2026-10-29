import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../../../src/application/projects/project.js';
import { amy, request, setup } from '../../../support/store-upload-harness.js';

// RF-158, RF-159: the work after the request always ends its batch, even when the log is down, and
// no rejection is left without a handler.

const counts = { sheets: 2, nonEmptyCells: 30, formulas: 4, macroModules: 0, macrosSkipped: 0 };
const entry = {
  fileName: 'Pricing.xlsx',
  folder: 'Pricing.xlsx',
  sizeBytes: 2048,
  sha256: `sha256:${'12'.repeat(32)}`,
  counts,
};
const line = { name: 'Pricing.xlsx', sheets: 2, cells: 30, formulas: 4, macroModules: 0 };

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

describe('StoreUpload the work after the request and a log that is down', () => {
  const unhandled: unknown[] = [];
  const keep = (reason: unknown): void => {
    unhandled.push(reason);
  };
  afterEach(() => {
    process.off('unhandledRejection', keep);
    unhandled.length = 0;
  });

  it('RF-158 ends the batch refused, frees the project and leaves no rejection unhandled', async () => {
    process.on('unhandledRejection', keep);
    const world = await setup();
    const { project, uploads, logger, batches } = world;
    const release = holding(uploads);
    uploads.failWith = new Error('disk full');
    vi.spyOn(logger, 'log').mockRejectedValue(new Error('log disk full'));
    const batchId = await batchOf(world, project);

    release();
    await settle();
    const read = await batches.state({ actor: amy, projectId: project.id, batchId });
    uploads.failWith = undefined;
    uploads.gate = undefined;
    const next = await world.useCase.execute(request(project));
    await settle();

    expect(read.ok && read.value.phase).toBe('refused');
    expect(read.ok && read.value.refusal).toMatchObject({ message: 'disk full' });
    expect(next.ok).toBe(true);
    expect(unhandled).toEqual([]);
  });
});
