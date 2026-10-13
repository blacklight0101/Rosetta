import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { costEntry } from '../../../support/cost-fixtures.js';
import { createHistoryHarness, type HistoryHarness } from '../../../support/history-harness.js';

// RF-1008, RF-1108, RF-1105, RF-1010: GET /api/projects/overview gives the Projects page each of the
// signed-in user's projects with its run count, its totals from the cost ledger and its latest run
// with the state and, while it is queued, its queue position. Only the user's own projects are
// listed; a queued run is cancelled with POST /api/runs/:runId/stop, which answers 404 to another
// user.

let harness: HistoryHarness | undefined;

afterEach(async () => {
  await harness?.test.server.close();
  harness = undefined;
});

const overviewUrl = '/api/projects/overview';

interface OverviewRow {
  readonly project: { readonly id: string; readonly name: string };
  readonly runs: number;
  readonly totals: Record<string, unknown>;
  readonly lastRun: Record<string, unknown> | null;
}

async function overviewOf(
  browser: HistoryHarness['amy'],
): Promise<{ status: number; rows: OverviewRow[]; body: string }> {
  const response = await browser.request({ method: 'GET', url: overviewUrl });
  const body = response.json<{ projects?: OverviewRow[] }>();
  return { status: response.statusCode, rows: body.projects ?? [], body: response.body };
}

/** A third run of amy's project: she already has one running, so it waits in the queue. */
async function queueOne(test: HistoryHarness): Promise<Run> {
  const user = await test.test.users.findById(test.userId);
  const project = await test.test.projects.find(test.userId, test.projectId);
  if (user === undefined || project === undefined) throw new Error('No user or project.');
  const actor = actorOf(user);
  const outcome = await test.test.runs.submit.execute({
    actor,
    project,
    stage: 'scan',
    options: {},
  });
  if (!outcome.ok) throw new Error('The run was not accepted');
  return outcome.value.run;
}

describe('GET /api/projects/overview rows', () => {
  it('RF-1008 gives each project its run count, ledger totals and latest run with its state', async () => {
    harness = await createHistoryHarness();
    const { amy, test, userId, projectId, live } = harness;
    test.costs.add(costEntry(userId, { projectId }));
    test.costs.add(costEntry(userId, { projectId, inputTokens: 500, costMicros: 300n }));

    const { status, rows } = await overviewOf(amy);

    expect(status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.project).toMatchObject({ id: projectId, name: 'octo/webforms' });
    expect(rows[0]?.runs).toBe(2);
    expect(rows[0]?.totals).toMatchObject({
      ...{ calls: 2, inputTokens: 1500, outputTokens: 200, cachedInputTokens: 100 },
      cost: [{ currency: 'USD', costMicros: '1000' }],
      unknownCostCalls: 0,
    });
    expect(rows[0]?.lastRun).toMatchObject({
      ...{ id: live.id, runId: live.runKey, stage: 'scan' },
      ...{ queueState: 'Running', endState: null, position: null },
    });
  });

  it('RF-1008 lists a project without runs with no latest run and zero totals', async () => {
    harness = await createHistoryHarness();
    const { amy } = harness;
    await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: 'https://github.com/octo/demo' },
    });

    const { rows } = await overviewOf(amy);

    const demo = rows.find((row) => row.project.name === 'octo/demo');
    expect(demo).toMatchObject({ runs: 0, lastRun: null });
    expect(demo?.totals).toMatchObject({ calls: 0, inputTokens: 0, outputTokens: 0, cost: [] });
  });
});

describe('GET /api/projects/overview queue', () => {
  it('RF-1108 gives a queued latest run its position in the queue', async () => {
    harness = await createHistoryHarness();
    const queued = await queueOne(harness);

    const { rows } = await overviewOf(harness.amy);

    expect(rows[0]?.runs).toBe(3);
    expect(rows[0]?.lastRun).toMatchObject({
      ...{ id: queued.id, queueState: 'Queued', endState: null, position: 1 },
    });
  });

  it('RF-1108 a cancelled queued run ends Interrupted and has no position any more', async () => {
    harness = await createHistoryHarness();
    const queued = await queueOne(harness);

    const stop = await harness.amy.request({ method: 'POST', url: `/api/runs/${queued.id}/stop` });
    const { rows } = await overviewOf(harness.amy);

    expect(stop.statusCode).toBe(200);
    expect(rows[0]?.lastRun).toMatchObject({
      ...{ id: queued.id, queueState: 'Ended', endState: 'Interrupted', position: null },
    });
  });
});

describe('GET /api/projects/overview scope', () => {
  it("RF-1105 lists none of another user's projects and never shows an owner id", async () => {
    harness = await createHistoryHarness();
    const { bob, userId } = harness;

    const { status, rows, body } = await overviewOf(bob);

    expect(status).toBe(200);
    expect(rows).toEqual([]);
    expect(body).not.toContain(userId);
  });

  it('RF-1105 never shows the owner id or the snapshot folder of a run', async () => {
    harness = await createHistoryHarness();

    const { body } = await overviewOf(harness.amy);

    expect(body).not.toContain(harness.userId);
    expect(body).not.toContain('snapshotKey');
    expect(body).not.toContain('octo__webforms@');
  });

  it('RF-1105 another user cannot cancel the queued run: 404 like an unknown id, and it stays queued', async () => {
    harness = await createHistoryHarness();
    const queued = await queueOne(harness);

    const other = await harness.bob.request({ method: 'POST', url: `/api/runs/${queued.id}/stop` });
    const { rows } = await overviewOf(harness.amy);

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(rows[0]?.lastRun).toMatchObject({ id: queued.id, queueState: 'Queued', position: 1 });
  });
});
