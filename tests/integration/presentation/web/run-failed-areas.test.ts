import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-208, RF-1008, RF-1002: the number of areas that gave no usable card is kept on the run row, so
// the run page, the history list and the Projects table can say "Completed, 2 areas failed" without
// reading the run's events. A run that ended without failed areas, and a run that has not ended,
// say 0.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly amy: TestBrowser;
  readonly failed: Run;
  readonly clean: Run;
  readonly test: TestServer;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const amy = await signedInBrowser(test.server, user);
  const created = await amy.request({
    method: 'POST',
    url: '/api/projects',
    payload: { url: 'https://github.com/octo/webforms' },
  });
  const project = await test.projects.find(user.account.id, created.json<{ id: string }>().id);
  if (project === undefined) throw new Error('The project was not stored');
  const ended = async (outcome: { endState: 'Completed'; failedAreas?: number }): Promise<Run> => {
    const accepted = await test.runs.submit.execute({
      actor: actorOf(user.account),
      project,
      stage: 'scan',
      options: {},
    });
    if (!accepted.ok) throw new Error('The run was not accepted');
    test.runs.executor.settle(accepted.value.run.id, outcome);
    return test.runs.ended(accepted.value.run);
  };
  const clean = await ended({ endState: 'Completed' });
  test.clock.advance(60_000);
  const failed = await ended({ endState: 'Completed', failedAreas: 2 });
  return { test, failed, clean, amy };
}

describe('the failed areas of an ended run', () => {
  it('RF-208 GET /api/runs/:runId gives the number of failed areas, 0 for a clean run', async () => {
    const { amy, failed, clean } = await setup();

    const one = await amy.request({ method: 'GET', url: `/api/runs/${failed.id}` });
    const two = await amy.request({ method: 'GET', url: `/api/runs/${clean.id}` });

    expect(one.json<{ failedAreas: unknown }>().failedAreas).toBe(2);
    expect(two.json<{ failedAreas: unknown }>().failedAreas).toBe(0);
  });

  it('RF-208 the history of the project gives it for each run', async () => {
    const { amy, failed, clean } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: `/api/projects/${failed.projectId}/history`,
    });

    const runs = response.json<{ runs: { id: string; failedAreas: unknown }[] }>().runs;
    expect(runs.map((run) => [run.id, run.failedAreas]).sort()).toEqual(
      [
        [failed.id, 2],
        [clean.id, 0],
      ].sort(),
    );
  });

  it('RF-208 the Projects overview gives it for the last run of a project (the one with failed areas)', async () => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'GET', url: '/api/projects/overview' });

    const rows = response.json<{ projects: { lastRun: { failedAreas: unknown } | null }[] }>();
    expect(rows.projects[0]?.lastRun?.failedAreas).toBe(2);
  });
});
