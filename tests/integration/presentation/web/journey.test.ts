import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { addPlanRun } from '../../../support/journey-seed.js';
import { seedPlanSource } from '../../../support/plan-source-seed.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-615, RF-1105: the journey route gives the strip its facts. Amy has an understand run, a plan
// run that failed and a project of her own; Bob owns a project and a run Amy must never see.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

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
  const project = sampleProject({ userId: actorOf(amyUser.account).userId });
  await test.projects.insertOrFind(project);
  const understand = runOf(
    await seedPlanSource(stores, project, { run: { endedAt: Date.UTC(2026, 9, 12, 9, 41, 0) } }),
  );
  const startedAt = Date.parse('2026-10-12T10:30:00.000Z');
  const plan = await addPlanRun(test.runs, project, {
    ...{ runKey: '20261012-103000-plan', sourceRunKey: understand.runKey, endState: 'Failed' },
    ...{ errorCode: 'RST-1803', startedAt, costMicros: 31_000 },
  });
  const bobProject = sampleProject({ userId: actorOf(bobUser.account).userId });
  await test.projects.insertOrFind(bobProject);
  const theirs = runOf(await seedPlanSource(stores, bobProject, { brief: false }));
  return {
    stores,
    test,
    project,
    understand,
    plan,
    theirs,
    amy: await signedInBrowser(test.server, amyUser),
  };
}

const journeyUrl = (projectId: string, run?: string): string =>
  `/api/projects/${projectId}/journey${run === undefined ? '' : `?run=${run}`}`;

describe('GET /api/projects/:id/journey', () => {
  it('RF-615 gives the facts of the understand run, the failed plan run and the brief', async () => {
    const { amy, project, understand, plan } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: journeyUrl(project.id, understand.id),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      briefSaved: true,
      source: {
        ...{ id: understand.id, runKey: '20261012-090000-understand', endState: 'Completed' },
        ...{ supportedClaims: 4, openQuestions: 2, errorCode: null },
      },
      plan: { id: plan.id, endState: 'Failed', errorCode: 'RST-1803', costMicros: 31_000 },
      handoff: null,
    });
  });

  it('RF-615 gives instants as ISO text', async () => {
    const { amy, project, understand } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: journeyUrl(project.id, understand.id),
    });

    expect(response.json()).toMatchObject({
      source: { endedAt: '2026-10-12T09:41:00.000Z' },
      plan: { endedAt: '2026-10-12T10:31:00.000Z' },
    });
  });

  it('RF-615 the plan run page gets the journey of the understand run it was written from', async () => {
    const { amy, project, understand, plan } = await setup();

    const response = await amy.request({ method: 'GET', url: journeyUrl(project.id, plan.id) });

    expect(response.json()).toMatchObject({ source: { id: understand.id }, plan: { id: plan.id } });
  });
});

describe('GET /api/projects/:id/journey (2)', () => {
  it('RF-615 without a run it is the journey of the newest completed understand run', async () => {
    const { amy, project, understand } = await setup();

    const response = await amy.request({ method: 'GET', url: journeyUrl(project.id) });

    expect(response.json()).toMatchObject({ source: { id: understand.id } });
  });
});

describe('GET /api/projects/:id/journey (capped source)', () => {
  it('RF-615 RF-614 P3-121 counts the Supported claims of a run that ended CapReached, open questions stay 0', async () => {
    const { amy, project, stores } = await setup();
    const stopped = runOf(
      await seedPlanSource(stores, project, {
        run: { runKey: '20261013-090000-understand', endState: 'CapReached' },
      }),
    );

    const response = await amy.request({ method: 'GET', url: journeyUrl(project.id, stopped.id) });

    const body = response.json<{ source: { supportedClaims: number; openQuestions: number } }>();
    expect(body.source.supportedClaims).toBeGreaterThan(0);
    expect(body.source.openQuestions).toBe(0);
  });
});

describe('GET /api/projects/:id/journey (3)', () => {
  it('RF-615 gives null for the end of a run that is still running', async () => {
    const { amy, project, stores } = await setup();
    const running = runOf(
      await seedPlanSource(stores, project, {
        brief: false,
        run: {
          ...{ runKey: '20261013-090000-understand', queueState: 'Running' },
          ...{ endState: null, endedAt: null },
        },
      }),
    );

    const response = await amy.request({ method: 'GET', url: journeyUrl(project.id, running.id) });

    expect(response.json()).toMatchObject({
      source: { queueState: 'Running', endedAt: null },
    });
  });
});

describe('GET /api/projects/:id/journey refuses', () => {
  it("RF-1105 another user's run id answers 404", async () => {
    const { amy, project, theirs } = await setup();

    const response = await amy.request({ method: 'GET', url: journeyUrl(project.id, theirs.id) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });

  it("RF-1105 another user's project answers 404", async () => {
    const { amy, theirs } = await setup();

    const response = await amy.request({ method: 'GET', url: journeyUrl(theirs.projectId) });

    expect(response.statusCode).toBe(404);
  });

  it('RF-615 a run id that is too long answers 400', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: journeyUrl(project.id, 'x'.repeat(100)),
    });

    expect(response.statusCode).toBe(400);
  });

  it('RF-1009 a request with no session answers 401', async () => {
    const { test, project } = await setup();

    const response = await test.server.inject({ method: 'GET', url: journeyUrl(project.id) });

    expect(response.statusCode).toBe(401);
  });
});
