import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { costEntry } from '../../../support/cost-fixtures.js';
import { createHistoryHarness, type HistoryHarness } from '../../../support/history-harness.js';

// RF-1012, DEC-55, RF-1105, RF-1009: DELETE /api/runs/:runId and DELETE /api/projects/:id remove
// the folder and the rows of a run or project that is not in progress, answer how many bytes they
// freed, write an info entry, and leave the cost ledger alone, so the totals still include the
// calls of what was deleted.

let harness: HistoryHarness | undefined;

afterEach(async () => {
  await harness?.test.server.close();
  harness = undefined;
});

async function setup(): Promise<HistoryHarness> {
  harness = await createHistoryHarness();
  return harness;
}

describe('DELETE /api/runs/:runId', () => {
  it('RF-1012 removes the run folder and the run, answers the space freed and writes an info entry', async () => {
    const { test, amy, done, projectId, userId } = await setup();

    const response = await amy.request({ method: 'DELETE', url: `/api/runs/${done.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ freedBytes: 5 });
    expect(test.folders.has({ userId, projectId, runKey: done.runKey })).toBe(false);
    expect(test.folders.has({ userId, projectId })).toBe(true);
    const gone = await amy.request({ method: 'GET', url: `/api/runs/${done.id}` });
    expect(gone.statusCode).toBe(404);
    const entry = test.logger.entries.find((candidate) => candidate.logger === 'history');
    expect(entry).toMatchObject({ data: { runKey: done.runKey, freedBytes: 5 } });
  });

  it('RF-1012 keeps the cost ledger: the project cost and the account totals do not change', async () => {
    const { test, amy, done, projectId, userId } = await setup();
    test.costs.add(costEntry(userId, { projectId, runId: done.id }));
    const read = async (url: string): Promise<string> =>
      (await amy.request({ method: 'GET', url })).body;
    const costUrl = `/api/projects/${projectId}/cost`;
    const [costBefore, totalsBefore] = [await read(costUrl), await read('/api/account/totals')];

    await amy.request({ method: 'DELETE', url: `/api/runs/${done.id}` });

    expect(await read(costUrl)).toBe(costBefore);
    expect(await read('/api/account/totals')).toBe(totalsBefore);
    expect(costBefore).toContain(done.id);
  });
});

describe('DELETE /api/runs/:runId refusals', () => {
  it('RF-1012 refuses a run that is in progress with 409 and removes nothing', async () => {
    const { test, amy, live, projectId, userId } = await setup();
    test.folders.seed({ userId, projectId, runKey: live.runKey }, { 'events.jsonl': '{}' });

    const response = await amy.request({ method: 'DELETE', url: `/api/runs/${live.id}` });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.deleteRefusedInUse });
    expect(test.folders.has({ userId, projectId, runKey: live.runKey })).toBe(true);
    const still = await amy.request({ method: 'GET', url: `/api/runs/${live.id}` });
    expect(still.statusCode).toBe(200);
  });

  it("RF-1105 answers 404 for another user's run, like an unknown one, and removes nothing", async () => {
    const { test, bob, done, projectId, userId } = await setup();

    const other = await bob.request({ method: 'DELETE', url: `/api/runs/${done.id}` });
    const unknown = await bob.request({ method: 'DELETE', url: '/api/runs/not-a-uuid' });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual(unknown.json());
    expect(test.folders.has({ userId, projectId, runKey: done.runKey })).toBe(true);
  });

  it('RF-1009 refuses a delete without the CSRF token and removes nothing', async () => {
    const { test, amy, done, projectId, userId } = await setup();

    const response = await amy.request({
      ...{ method: 'DELETE', url: `/api/runs/${done.id}` },
      csrf: false,
    });

    expect(response.statusCode).toBe(403);
    expect(test.folders.has({ userId, projectId, runKey: done.runKey })).toBe(true);
  });
});

describe('DELETE /api/projects/:id', () => {
  it('RF-1012 refuses a project with a run in progress with 409 and removes nothing', async () => {
    const { test, amy, projectId, userId } = await setup();

    const response = await amy.request({ method: 'DELETE', url: `/api/projects/${projectId}` });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.deleteRefusedInUse });
    expect(test.folders.has({ userId, projectId })).toBe(true);
    const still = await amy.request({ method: 'GET', url: `/api/projects/${projectId}` });
    expect(still.statusCode).toBe(200);
  });

  it("RF-1105 answers 404 for another user's project, like an unknown one, and removes nothing", async () => {
    const { test, bob, projectId, userId } = await setup();

    const other = await bob.request({ method: 'DELETE', url: `/api/projects/${projectId}` });
    const unknown = await bob.request({ method: 'DELETE', url: '/api/projects/not-a-uuid' });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual(unknown.json());
    expect(test.folders.has({ userId, projectId })).toBe(true);
  });
});

describe('DELETE /api/projects/:id once its runs have ended', () => {
  it('RF-1012 removes the project, its runs and its folder, and keeps the ledger', async () => {
    const { test, amy, done, live, projectId, userId } = await setup();
    test.runs.executor.settle(live.id, { endState: 'Completed' });
    await test.runs.ended(live);
    test.costs.add(costEntry(userId, { projectId, runId: done.id }));
    const totalsBefore = (await amy.request({ method: 'GET', url: '/api/account/totals' })).body;

    const response = await amy.request({ method: 'DELETE', url: `/api/projects/${projectId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ freedBytes: 7 });
    expect(test.folders.has({ userId, projectId })).toBe(false);
    const urls = [`/api/projects/${projectId}`, `/api/runs/${done.id}`, `/api/runs/${live.id}`];
    for (const url of urls) {
      expect((await amy.request({ method: 'GET', url })).statusCode).toBe(404);
    }
    const totalsAfter = (await amy.request({ method: 'GET', url: '/api/account/totals' })).body;
    expect(totalsAfter).toBe(totalsBefore);
    const entry = test.logger.entries.find((candidate) => candidate.logger === 'history');
    expect(entry).toMatchObject({ data: { projectId, freedBytes: 7 } });
  });
});
