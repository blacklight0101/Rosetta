import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  completedCommit,
  createHistoryHarness,
  type HistoryHarness,
} from '../../../support/history-harness.js';
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
      ...{ id: live.id, runId: live.runKey, stage: 'scan', queueState: 'Running' },
      ...{ endState: null, commitSha: null, sizeBytes: 0 },
    });
    expect(runs[1]).toEqual({
      ...{ id: done.id, runId: done.runKey, stage: 'scan', queueState: 'Ended' },
      ...{
        endState: 'Completed',
        commitSha: completedCommit,
        sizeBytes: 5,
        failedAreas: 0,
        unreadAreas: 0,
      },
      ...{ queuedAt: instant, startedAt: instant, endedAt: instant },
      totals: {
        ...{ costMicros: 1_310_000, inputTokens: 400_000 },
        ...{ outputTokens: 12_606, cachedInputTokens: 0 },
      },
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
      ...{ sourceUrl: 'https://github.com/octo/webforms' },
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
