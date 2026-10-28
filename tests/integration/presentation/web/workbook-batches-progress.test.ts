import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { bodyOf } from '../../../support/upload-route-harness.js';
import { encryptedBook, sampleBook } from '../../../support/workbook-staging-harness.js';
import {
  batchState,
  cancelBatch,
  createWorkbookProject,
  currentBatch,
  finishBatch,
  settledBatch,
  openBatch,
  putFile,
  useWorkbookServers,
} from '../../../support/workbook-route-harness.js';

// RF-159, RF-158, RF-1105, DEC-183: finishing a batch answers 202 at once; the state endpoints give
// the step, the counts, the elapsed time and the outcome, also for a page that was reloaded.

const setup = useWorkbookServers();

async function withBook(amy: Parameters<typeof createWorkbookProject>[0], name = 'Pricing') {
  const projectId = await createWorkbookProject(amy);
  const target = { projectId, batchId: await openBatch(amy, projectId) };
  await putFile(amy, target, { name: `${name}.xlsx`, bytes: await sampleBook() });
  return target;
}

describe('POST finish and GET the state of a batch', () => {
  it('RF-159 answers 202 at once with the batch at work, then the state ends with the summary', async () => {
    const { amy } = await setup();
    const target = await withBook(amy);

    const accepted = await finishBatch(amy, target);
    const ended = await settledBatch(amy, target);
    const state = await batchState(amy, target);

    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toMatchObject({
      batchId: target.batchId,
      phase: 'processing',
      files: 1,
    });
    expect(ended.statusCode).toBe(201);
    expect(state.statusCode).toBe(200);
    expect(Object.keys(bodyOf(state))).toContain('elapsedMs');
    expect(state.json()).toMatchObject({
      phase: 'stored',
      summary: { workbooks: [{ name: 'Pricing.xlsx', sheets: 1 }] },
    });
  });
});

describe('GET the state of a batch after a reload and a refusal', () => {
  it('RF-159 shows the same state to a page that asks again, without the batch id', async () => {
    const { amy } = await setup();
    const target = await withBook(amy);
    const before = await currentBatch(amy, target.projectId);
    await finishBatch(amy, target);
    await settledBatch(amy, target);

    const reloaded = await currentBatch(amy, target.projectId);

    expect(before.json()).toMatchObject({ phase: 'open', files: 1 });
    expect(reloaded.statusCode).toBe(200);
    expect(reloaded.json()).toMatchObject({
      batchId: target.batchId,
      phase: 'stored',
      summary: { workbooks: [{ name: 'Pricing.xlsx' }] },
    });
  });

  it('RF-158 shows a refusal after acceptance with the file, the reason and the next step', async () => {
    const { amy } = await setup();
    const projectId = await createWorkbookProject(amy);
    const target = { projectId, batchId: await openBatch(amy, projectId) };
    await putFile(amy, target, { name: 'Locked.xlsx', bytes: encryptedBook() });

    const accepted = await finishBatch(amy, target);
    await settledBatch(amy, target);
    const state = await batchState(amy, target);
    const shown = await amy.request({ method: 'GET', url: `/api/projects/${projectId}` });

    expect(accepted.statusCode).toBe(202);
    expect(state.json()).toMatchObject({
      phase: 'refused',
      refusal: {
        status: 400,
        code: ERROR_CODES.workbookEncrypted,
        problems: [{ field: 'Locked.xlsx', code: ERROR_CODES.workbookEncrypted }],
      },
    });
    expect(JSON.stringify(state.json())).toContain('Remove the password');
    expect(shown.json()).toMatchObject({ source: null });
  });
});

describe('POST finish and cancel', () => {
  it('RF-159 cancel after acceptance answers 204 and the batch is gone', async () => {
    const { amy } = await setup();
    const target = await withBook(amy);
    await finishBatch(amy, target);

    const cancelled = await cancelBatch(amy, target);
    const state = await batchState(amy, target);
    const reopened = await amy.request({
      method: 'POST',
      url: `/api/projects/${target.projectId}/source/batches`,
    });

    expect(cancelled.statusCode).toBe(204);
    expect(state.statusCode).toBe(404);
    expect(reopened.statusCode).toBe(201);
  });
});

describe('the state routes and who may read them', () => {
  it("RF-1105 answers 404 for another user's batch, an unknown batch and a project with none", async () => {
    const { amy, bob } = await setup();
    const target = await withBook(amy);
    const empty = await createWorkbookProject(amy, 'Empty');

    const foreign = await batchState(bob, target);
    const foreignCurrent = await currentBatch(bob, target.projectId);
    const unknown = await batchState(amy, { ...target, batchId: 'no-such-batch' });
    const none = await currentBatch(amy, empty);

    for (const answer of [foreign, foreignCurrent, unknown, none]) {
      expect(answer.statusCode).toBe(404);
      expect(answer.json()).toMatchObject({ code: ERROR_CODES.notFound });
    }
  });

  it('RF-1009 asks for a session', async () => {
    const { test, amy } = await setup();
    const target = await withBook(amy);

    const answer = await test.server.inject({
      method: 'GET',
      url: `/api/projects/${target.projectId}/source/batches/current`,
    });

    expect(answer.statusCode).toBe(401);
  });
});
