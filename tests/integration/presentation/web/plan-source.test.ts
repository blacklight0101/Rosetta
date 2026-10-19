import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSaying } from '../../../support/plan-cards.js';
import { plannerSettings } from '../../../support/plan-estimate-harness.js';
import { seedPlanSource, type PlanSourceSeed } from '../../../support/plan-source-seed.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-614, RF-605, RF-1105, RST-1802: Plan setup names its source run and every plan route takes the
// run the person chose. Amy's project has two completed understand runs; Bob owns a project and a
// run of his own, whose id Amy must not be able to use.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const cloud = { provider: 'openai', model: 'priced-model' } as const;

function runOf(run: Run | undefined): Run {
  if (run === undefined) throw new Error('The run was not seeded');
  return run;
}

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const masker = new SecretMasker();
  const briefs = new FilePlanningBriefStore({ writer: test.briefFiles, masker });
  const stores = { files: test.answerFiles, briefs, runs: test.runs.runs };
  const project = sampleProject({
    userId: actorOf(amyUser.account).userId,
    settings: plannerSettings(cloud),
  });
  await test.projects.insertOrFind(project);
  const seed = (given: PlanSourceSeed): Promise<Run | undefined> =>
    seedPlanSource(stores, project, given);
  const older = runOf(await seed({ run: { runKey: '20261010-090000-understand' } }));
  const newer = runOf(
    await seed({
      ...{ brief: false, cards: [cardSaying('BR-900', 'Archiving moves an order.')] },
      run: { runKey: '20261011-090000-understand' },
    }),
  );
  const bobProject = sampleProject({ userId: actorOf(bobUser.account).userId });
  await test.projects.insertOrFind(bobProject);
  const theirs = runOf(await seedPlanSource(stores, bobProject, { brief: false }));
  return {
    ...{ test, project, older, newer, theirs, seed },
    amy: await signedInBrowser(test.server, amyUser),
  };
}

const sourceUrl = (projectId: string, run?: string): string =>
  `/api/projects/${projectId}/plan-source${run === undefined ? '' : `?run=${run}`}`;
const estimateUrl = (projectId: string, run?: string): string =>
  `/api/projects/${projectId}/plan-estimate${run === undefined ? '' : `?run=${run}`}`;

describe('GET /api/projects/:id/plan-source', () => {
  it('RF-614 names the chosen run', async () => {
    const { amy, project, older } = await setup();

    const response = await amy.request({ method: 'GET', url: sourceUrl(project.id, older.id) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      ...{ runId: older.id, runKey: '20261010-090000-understand', newest: false },
      ...{ areas: ['orders'], supportedClaims: 4 },
    });
  });

  it('RF-614 without a run names the newest completed one', async () => {
    const { amy, project, newer } = await setup();

    const response = await amy.request({ method: 'GET', url: sourceUrl(project.id) });

    expect(response.json()).toMatchObject({ runId: newer.id, newest: true, supportedClaims: 1 });
  });

  it("RF-1105 another user's run id is refused with 404", async () => {
    const { amy, project, theirs } = await setup();

    const response = await amy.request({ method: 'GET', url: sourceUrl(project.id, theirs.id) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });

  it('RST-1802 a run that ended CapReached answers 409', async () => {
    const { amy, project, seed } = await setup();
    const stopped = runOf(await seed({ brief: false, run: { endState: 'CapReached' } }));

    const response = await amy.request({ method: 'GET', url: sourceUrl(project.id, stopped.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.planSourceMissing });
  });
});

describe('GET /api/projects/:id/plan-source details', () => {
  it('RF-614 gives the instant the run ended as ISO text', async () => {
    const { amy, project, seed } = await setup();
    const ended = Date.UTC(2026, 9, 12, 9, 41, 0);
    const run = runOf(await seed({ brief: false, run: { endedAt: ended } }));

    const response = await amy.request({ method: 'GET', url: sourceUrl(project.id, run.id) });

    expect(response.json()).toMatchObject({ endedAt: '2026-10-12T09:41:00.000Z' });
  });

  it('RF-614 a run that has no end instant answers null', async () => {
    const { amy, project, older } = await setup();

    const response = await amy.request({ method: 'GET', url: sourceUrl(project.id, older.id) });

    expect(response.json()).toMatchObject({ endedAt: null });
  });

  it('RF-614 the estimate refuses a run id that is too long with 400', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: estimateUrl(project.id, 'x'.repeat(100)),
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/projects/:id/plan-source refuses', () => {
  it('RF-614 a run id that is too long answers 400', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: sourceUrl(project.id, 'x'.repeat(100)),
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('plan routes take the chosen run', () => {
  it('RF-614 the estimate is measured from the chosen run', async () => {
    const { amy, project, older } = await setup();

    const chosen = await amy.request({ method: 'GET', url: estimateUrl(project.id, older.id) });
    const newest = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    const supported = (body: unknown): number =>
      z.object({ assumptions: z.object({ supportedCards: z.number() }) }).parse(body).assumptions
        .supportedCards;
    expect(supported(chosen.json())).toBeGreaterThan(supported(newest.json()));
  });

  it("RF-1105 the estimate refuses another user's run id with 404", async () => {
    const { amy, project, theirs } = await setup();

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id, theirs.id) });

    expect(response.statusCode).toBe(404);
  });

  it("RF-1105 starting a plan run from another user's run is refused with 404", async () => {
    const { amy, project, theirs } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: `/api/projects/${project.id}/runs`,
      payload: { stage: 'plan', cloudConsent: true, sourceRunId: theirs.id },
    });

    expect(response.statusCode).toBe(404);
  });

  it("RF-1105 the options refuse another user's run id with 404", async () => {
    const { amy, project, theirs } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: `/api/projects/${project.id}/plan-options`,
      payload: { cloudConsent: true, sourceRunId: theirs.id },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('plan routes refuse a run not complete or not yours', () => {
  it('RST-1802 starting a plan run from a run that ended Failed answers 409', async () => {
    const { amy, project, seed } = await setup();
    const failed = runOf(await seed({ brief: false, run: { endState: 'Failed' } }));

    const response = await amy.request({
      method: 'POST',
      url: `/api/projects/${project.id}/runs`,
      payload: { stage: 'plan', cloudConsent: true, sourceRunId: failed.id },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.planSourceMissing });
  });

  it('RF-614 an unknown run id is refused with 404 before any plan run exists', async () => {
    const { amy, project, test } = await setup();
    const before = (await test.runs.runs.list(project.userId, project.id)).length;

    const response = await amy.request({
      method: 'POST',
      url: `/api/projects/${project.id}/runs`,
      payload: { stage: 'plan', cloudConsent: true, sourceRunId: sampleRun().id },
    });

    expect(response.statusCode).toBe(404);
    expect(await test.runs.runs.list(project.userId, project.id)).toHaveLength(before);
  });
});
