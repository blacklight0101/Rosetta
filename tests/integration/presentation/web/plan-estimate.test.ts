import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { plannerSettings } from '../../../support/plan-estimate-harness.js';
import { seedPlanSource, type PlanSourceSeed } from '../../../support/plan-source-seed.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-613, RF-1105: GET /api/projects/:id/plan-estimate through the server with a session. The cards,
// the answers and the planning brief are the real file adapters over memory folders; the planner
// is a priced OpenAI model on the server's key (250,000 micros per million input tokens and
// 2,000,000 per million output tokens), so the figures come from the price table.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const cloud = { provider: 'openai', model: 'priced-model' } as const;

async function setup(seed: PlanSourceSeed = {}, settings = plannerSettings(cloud)) {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const project = sampleProject({
    userId: actorOf(amyUser.account).userId,
    settings,
  });
  await test.projects.insertOrFind(project);
  const briefs = new FilePlanningBriefStore({
    writer: test.briefFiles,
    masker: new SecretMasker(),
  });
  await seedPlanSource({ files: test.answerFiles, briefs, runs: test.runs.runs }, project, seed);
  return {
    test,
    project,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const estimateUrl = (projectId: string): string => `/api/projects/${projectId}/plan-estimate`;

const point = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  costMicros: z.string(),
});
const scenarios = z.object({ low: z.boolean(), likely: z.boolean(), high: z.boolean() });
const estimateBody = z.object({
  planner: z.object({ role: z.string(), low: point, likely: point, high: point }).loose(),
  assumptions: z
    .object({
      promptTokens: z.number(),
      prdPromptTokens: z.number(),
      dataModelPromptTokens: z.number(),
      apiContractPromptTokens: z.number(),
      uxPromptTokens: z.number(),
      coveragePromptTokens: z.number(),
      maxOutputTokens: z.number(),
    })
    .loose(),
  caps: z.array(
    z.object({
      ...{ kind: z.string(), unit: z.string(), limit: z.string(), spent: z.string() },
      ...{ remaining: z.string(), fits: scenarios },
    }),
  ),
  withinCaps: scenarios,
  keyAvailable: z.boolean(),
});

describe('GET /api/projects/:id/plan-estimate answers', () => {
  it('RF-613 shows the planner estimate against the caps; micro-dollars travel as strings', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = estimateBody.parse(response.json());
    expect(body.planner).toMatchObject({
      ...{ role: 'planner', provider: 'openai', model: 'priced-model' },
      ...{ keySource: 'server', priced: true },
    });
    expect(body.planner.high.outputTokens).toBe(4 * 3 * body.assumptions.maxOutputTokens);
    expect(body.planner.high.inputTokens).toBeGreaterThan(body.assumptions.promptTokens);
    expect(BigInt(body.planner.high.costMicros)).toBeGreaterThan(0n);
    expect(body.caps.map((cap) => cap.kind)).toEqual([
      ...['run-cost', 'run-tokens', 'user-day', 'server-month'],
    ]);
    expect(body.caps[0]).toMatchObject({ unit: 'micros', limit: '500000', spent: '0' });
    expect(body.withinCaps).toEqual({ low: true, likely: true, high: true });
    expect(body.keyAvailable).toBe(true);
  });

  it('RF-613 says when the high figure no longer fits the project run cap', async () => {
    const capped = plannerSettings(cloud, (settings) => ({
      ...settings,
      budget: { ...settings.budget, run: { ...settings.budget.run, maxCostMicros: 3000 } },
    }));
    const { amy, project } = await setup({}, capped);

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    const body = estimateBody.parse(response.json());
    expect(body.caps[0]).toMatchObject({ kind: 'run-cost', limit: '3000' });
    expect(body.withinCaps.high).toBe(false);
  });
});

describe('GET /api/projects/:id/plan-estimate refuses', () => {
  it("RF-1105 another user's project is not found, like an unknown id", async () => {
    const { bob, project } = await setup();

    const theirs = await bob.request({ method: 'GET', url: estimateUrl(project.id) });
    const unknown = await bob.request({ method: 'GET', url: estimateUrl(sampleProject().id) });

    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(unknown.statusCode).toBe(404);
  });

  it('RST-1801 a project without a saved brief answers 409', async () => {
    const { amy, project } = await setup({ brief: false });

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.planBriefMissing });
  });

  it('RST-1802 a project without a finished understand run answers 409', async () => {
    const { amy, project } = await setup({ understand: false });

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.planSourceMissing });
  });

  it('RF-1009 a request without a session is refused', async () => {
    const { test, project } = await setup();

    const response = await test.server.inject({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(401);
  });
});
