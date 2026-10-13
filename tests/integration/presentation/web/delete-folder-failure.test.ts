import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { createHistoryHarness, type HistoryHarness } from '../../../support/history-harness.js';

// RF-1012, DEC-55, P1-138 (finding 1 of the P1-121 verdict): a folder that cannot be removed is
// answered with RST-1115 and HTTP 500 through the route, with the catalogue's message and next
// step and nothing of the failure (the system error, the folder path, the ids) in the body.

let harness: HistoryHarness | undefined;

afterEach(async () => {
  await harness?.test.server.close();
  harness = undefined;
});

async function setup(): Promise<HistoryHarness> {
  harness = await createHistoryHarness();
  harness.test.folders.refuseRemoval = true;
  return harness;
}

function expectCatalogueAnswer(statusCode: number, body: string, hidden: readonly string[]): void {
  expect(statusCode).toBe(500);
  const code = ERROR_CODES.folderRemovalFailed;
  expect(JSON.parse(body)).toEqual({ code, ...describeError(code) });
  for (const secret of ['EBUSY', 'resource busy', 'stack', ...hidden]) {
    expect(body).not.toContain(secret);
  }
}

describe('DELETE /api/runs/:runId when the folder cannot be removed', () => {
  it('RF-1012 answers 500 with RST-1115 and nothing of the failure, and keeps the run', async () => {
    const { test, amy, done, projectId, userId } = await setup();

    const response = await amy.request({ method: 'DELETE', url: `/api/runs/${done.id}` });

    expectCatalogueAnswer(response.statusCode, response.body, [projectId, done.runKey, userId]);
    const still = await amy.request({ method: 'GET', url: `/api/runs/${done.id}` });
    expect(still.statusCode).toBe(200);
    expect(test.folders.has({ userId, projectId, runKey: done.runKey })).toBe(true);
    const entry = test.logger.entries.find(
      (candidate) => candidate.code === ERROR_CODES.folderRemovalFailed,
    );
    expect(entry).toMatchObject({ level: 'error', logger: 'history' });
  });
});

describe('DELETE /api/projects/:id when the folder cannot be removed', () => {
  it('RF-1012 answers 500 with RST-1115 and nothing of the failure', async () => {
    const { test, amy, live, projectId, userId } = await setup();
    test.runs.executor.settle(live.id, { endState: 'Completed' });
    await test.runs.ended(live);

    const response = await amy.request({ method: 'DELETE', url: `/api/projects/${projectId}` });

    expectCatalogueAnswer(response.statusCode, response.body, [projectId, userId]);
    expect(test.folders.has({ userId, projectId })).toBe(true);
    const gone = await amy.request({ method: 'GET', url: `/api/projects/${projectId}` });
    expect(gone.statusCode).toBe(404);
    const entry = test.logger.entries.find(
      (candidate) => candidate.code === ERROR_CODES.folderRemovalFailed,
    );
    expect(entry).toMatchObject({ level: 'error', logger: 'history' });
  });
});
