import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { uploadProject } from '../../../support/store-upload-harness.js';
import {
  amy,
  batchCase,
  bob,
  fileRequest,
  limitBytes,
  workbookProject,
} from '../../../support/workbook-batch-harness.js';

// RF-150, RFC-005 section 4.2: opening a batch, one open batch per project, the owner's scope, the
// 30 minutes a batch lives and cancelling it.

const THIRTY_MINUTES = 30 * 60_000;
const OTHER_ID = '00000000-0000-4000-a000-0000000000f1';

async function opened(test: Awaited<ReturnType<typeof batchCase>>): Promise<string> {
  const outcome = await test.useCase.open({ actor: amy, projectId: test.project.id });
  if (!outcome.ok) throw new Error(`open refused: ${outcome.error}`);
  return outcome.value.batchId;
}

describe('WorkbookBatches.open', () => {
  it('RF-150 opens a batch and asks the staging area for the limit of the server', async () => {
    const test = await batchCase();

    const outcome = await test.useCase.open({ actor: amy, projectId: test.project.id });

    expect(outcome.ok).toBe(true);
    expect(test.staging.opened).toEqual([limitBytes]);
  });

  it('RF-150 refuses a second batch of the same project with RST-1919 and opens nothing', async () => {
    const test = await batchCase();
    await opened(test);

    const second = await test.useCase.open({ actor: amy, projectId: test.project.id });

    expect(second).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect(test.staging.opened).toHaveLength(1);
  });

  it('RF-150 lets two projects each hold a batch', async () => {
    const test = await batchCase();
    await test.projects.insertOrFind(workbookProject({ id: OTHER_ID }));
    await opened(test);

    const second = await test.useCase.open({ actor: amy, projectId: OTHER_ID });

    expect(second.ok).toBe(true);
  });

  it("RF-1105 answers not found for another user's project and an unknown id", async () => {
    const test = await batchCase();

    const foreign = await test.useCase.open({ actor: bob, projectId: test.project.id });
    const unknown = await test.useCase.open({ actor: amy, projectId: 'no-such-project' });

    expect(foreign).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(test.staging.opened).toEqual([]);
  });

  it('RF-150 refuses a project of another kind with RST-2005 and opens nothing', async () => {
    const test = await batchCase(uploadProject());

    const outcome = await test.useCase.open({ actor: amy, projectId: test.project.id });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.conflict });
    expect(test.staging.opened).toEqual([]);
  });
});

describe('WorkbookBatches a batch left open', () => {
  it('RF-150 frees a batch left open for 30 minutes: a new batch opens and the old staging is deleted', async () => {
    const test = await batchCase();
    const first = await opened(test);
    test.clock.advance(THIRTY_MINUTES + 60_000);

    const second = await test.useCase.open({ actor: amy, projectId: test.project.id });

    expect(second.ok).toBe(true);
    expect(test.staging.discarded).toEqual([first]);
  });

  it('RF-150 keeps a batch that is open for less than 30 minutes', async () => {
    const test = await batchCase();
    await opened(test);
    test.clock.advance(THIRTY_MINUTES - 1000);

    const second = await test.useCase.open({ actor: amy, projectId: test.project.id });

    expect(second).toEqual({ ok: false, error: ERROR_CODES.uploadInProgress });
    expect(test.staging.discarded).toEqual([]);
  });

  it('RF-150 answers not found to a file or a finish for an expired batch', async () => {
    const test = await batchCase();
    const batchId = await opened(test);
    test.clock.advance(THIRTY_MINUTES + 1000);

    const file = await test.useCase.receive(fileRequest(test.project, batchId));
    const finish = await test.useCase.finish({
      ...{ actor: amy, projectId: test.project.id, batchId, ip: '203.0.113.7' },
    });

    expect(file).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(finish).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });

  it('RF-150 sweeps the batches of other projects that expired when anyone opens one', async () => {
    const test = await batchCase();
    await test.projects.insertOrFind(workbookProject({ id: OTHER_ID }));
    const old = await opened(test);
    test.clock.advance(THIRTY_MINUTES + 1000);

    await test.useCase.open({ actor: amy, projectId: OTHER_ID });

    expect(test.staging.discarded).toEqual([old]);
  });
});

describe('WorkbookBatches.cancel', () => {
  it('RF-150 deletes the staging area, frees the project and ends the batch', async () => {
    const test = await batchCase();
    const batchId = await opened(test);

    const cancelled = await test.useCase.cancel({
      ...{ actor: amy, projectId: test.project.id, batchId },
    });
    const reopened = await test.useCase.open({ actor: amy, projectId: test.project.id });
    const file = await test.useCase.receive(fileRequest(test.project, batchId));

    expect(cancelled.ok).toBe(true);
    expect(test.staging.discarded).toEqual([batchId]);
    expect(reopened.ok).toBe(true);
    expect(file).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });

  it("RF-1105 does not cancel another user's batch, another project's batch or an unknown one", async () => {
    const test = await batchCase();
    await test.projects.insertOrFind(workbookProject({ id: OTHER_ID }));
    const batchId = await opened(test);

    const foreign = await test.useCase.cancel({
      ...{ actor: bob, projectId: test.project.id, batchId },
    });
    const wrongProject = await test.useCase.cancel({
      ...{ actor: amy, projectId: OTHER_ID, batchId },
    });
    const unknown = await test.useCase.cancel({
      ...{ actor: amy, projectId: test.project.id, batchId: 'no-such-batch' },
    });

    for (const outcome of [foreign, wrongProject, unknown]) {
      expect(outcome).toEqual({ ok: false, error: ERROR_CODES.notFound });
    }
    expect(test.staging.discarded).toEqual([]);
  });
});
