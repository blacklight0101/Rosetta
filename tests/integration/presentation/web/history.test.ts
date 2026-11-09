import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  completedCommit,
  createHistoryHarness,
  type HistoryHarness,
} from '../../../support/history-harness.js';
import { realPartlyRead } from '../../../support/partly-read-pipeline.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer } from '../../../support/web-server.js';

// RF-1008, RF-1105: GET /api/projects/:id/history lists the runs of one of the signed-in user's
// projects with their source, commit, stage, state and cost, and the size of each folder; another
// user's project answers 404 like an unknown one.

let harness: HistoryHarness | undefined;
const servers: { close(): Promise<void> }[] = [];

afterEach(async () => {
  await harness?.test.server.close();
  harness = undefined;
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const historyUrl = (projectId: string): string => `/api/projects/${projectId}/history`;
const instant = '2026-10-11T09:00:00.000Z';

describe('GET /api/projects/:id/history runs', () => {
  it('RF-1008 lists each run with its commit, stage, state, cost and size, newest first', async () => {
    harness = await createHistoryHarness();
    const { amy, projectId, done, live } = harness;

    const response = await amy.request({ method: 'GET', url: historyUrl(projectId) });

    expect(response.statusCode).toBe(200);
    const runs = response.json<{ runs: unknown[] }>().runs;
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      ...{ id: live.id, runId: live.runKey, stage: 'understand', queueState: 'Running' },
      ...{ endState: null, commitSha: null, sizeBytes: 0 },
      ...{ runningMs: null, wallMs: null },
    });
    expect(runs[1]).toEqual({
      ...{ id: done.id, runId: done.runKey, stage: 'scan', queueState: 'Ended' },
      ...{
        endState: 'Completed',
        commitSha: completedCommit,
        sizeBytes: 5,
        failedAreas: 0,
        unreadAreas: 0,
        partlyReadAreas: 0,
        readShare: null,
        endReason: null,
        position: null,
        deepenRounds: null,
        ...{ runningMs: 0, wallMs: 0 },
      },
      ...{ queuedAt: instant, startedAt: instant, endedAt: instant },
      totals: {
        ...{ costMicros: 1_310_000, inputTokens: 400_000 },
        ...{ outputTokens: 12_606, cachedInputTokens: 0 },
      },
    });
  });
});

describe('GET /api/projects/:id/history partly read runs (P8-130)', () => {
  it('RF-1008 RF-230 gives an ended understand run read below the bar its areas and the real share of its code', async () => {
    harness = await createHistoryHarness({ partlyRead: realPartlyRead() });
    const { amy, projectId, done, live, test } = harness;
    test.runs.executor.settle(live.id, { endState: 'Completed' });
    await test.runs.ended(live);

    const response = await amy.request({ method: 'GET', url: historyUrl(projectId) });

    const runs = response.json<{ runs: Record<string, unknown>[] }>().runs;
    const row = runs.find((each) => each['id'] === live.id);
    expect(row?.['partlyReadAreas']).toBe(1);
    expect(row?.['readShare']).toBeGreaterThan(0);
    expect(row?.['readShare']).toBeLessThan(0.8);
    expect(runs.find((each) => each['id'] === done.id)).toMatchObject({
      partlyReadAreas: 0,
      readShare: null,
    });
  });
});

describe('GET /api/projects/:id/history run times', () => {
  it('RF-1008 shows the first start, the running time and the wall time of a resumed run (P8-88)', async () => {
    harness = await createHistoryHarness();
    const { amy, projectId, done, userId, test } = harness;
    const first = Date.parse(instant);
    const again = first + 3_600_000;
    await test.runs.runs.reopen(userId, done.id, again, ['Completed']);
    await test.runs.runs.start(done.id, again);
    await test.runs.runs.end(done.id, 'Completed', again + 120_000);

    const response = await amy.request({ method: 'GET', url: historyUrl(projectId) });

    const runs = response.json<{ runs: Record<string, unknown>[] }>().runs;
    expect(runs.find((run) => run['id'] === done.id)).toMatchObject({
      startedAt: instant,
      endedAt: '2026-10-11T10:02:00.000Z',
      runningMs: 120_000,
      wallMs: 3_720_000,
    });
  });
});

describe('GET /api/projects/:id/history project', () => {
  it('RF-1008 names the source and the project folder with the space it holds', async () => {
    harness = await createHistoryHarness();
    const { amy, projectId } = harness;

    const response = await amy.request({ method: 'GET', url: historyUrl(projectId) });

    expect(response.json<Record<string, unknown>>()['project']).toEqual({
      ...{ id: projectId, name: 'octo/webforms', ref: '', subpath: '' },
      ...{ sourceUrl: 'https://github.com/octo/webforms', sourceKind: 'github' },
      ...{ folder: `projects/${projectId}`, sizeBytes: 7 },
    });
  });

  it('RF-1008 lists a project without runs as an empty list', async () => {
    const test = createTestServer();
    servers.push(test.server);
    const user = await addUser(test, { userName: 'cyril' });
    const browser = await signedInBrowser(test.server, user);
    const created = await browser.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: 'https://github.com/octo/demo' },
    });

    const response = await browser.request({
      method: 'GET',
      url: historyUrl(created.json<{ id: string }>().id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ runs: unknown[] }>().runs).toEqual([]);
  });
});

describe('GET /api/projects/:id/history scope', () => {
  it('RF-1105 never shows the owner id or the snapshot folder name', async () => {
    harness = await createHistoryHarness();
    const { amy, projectId, userId } = harness;

    const response = await amy.request({ method: 'GET', url: historyUrl(projectId) });

    expect(response.body).not.toContain(userId);
    expect(response.body).not.toContain('snapshotKey');
    expect(response.body).not.toContain('octo__webforms@');
  });

  it("RF-1105 answers 404 for another user's project, like an unknown one", async () => {
    harness = await createHistoryHarness();
    const { bob, projectId } = harness;

    const other = await bob.request({ method: 'GET', url: historyUrl(projectId) });
    const unknown = await bob.request({ method: 'GET', url: historyUrl('not-a-uuid') });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(other.json()).toEqual(unknown.json());
    expect(other.body).not.toContain('octo/webforms');
  });
});
