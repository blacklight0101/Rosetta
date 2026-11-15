import { afterEach, describe, expect, it, vi } from 'vitest';
import { readUnderstandOptions } from '../../../../src/application/understand/understand-options.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryJourneyRecords } from '../../../../src/infrastructure/db/memory-journey-records.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { plannerSettings } from '../../../support/plan-estimate-harness.js';
import { seedPlanSource } from '../../../support/plan-source-seed.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-432, RF-435, P9-01, EV-100: a Deepen of a journey paused at its approved amount after it used
// all that was left of the journey. Continue (+N) raises the journey's amount with the run's, so
// once the Deepen ends, Start the plan answers 202 under the N left, not RST-2311 "Press Analyse
// again" (the project page has no Analyse at that point).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const cloud = { provider: 'openai', model: 'priced-model' } as const;
const approved = { tokens: 3_000_000, costMicros: 400_000 };
const extra = { tokens: 1_000_000, costMicros: 100_000 };
const noCache = { outputTokens: 0, cachedInputTokens: 0 };

async function stateOf(test: TestServer, run: Run, state: Run['queueState']): Promise<Run> {
  let latest: Run | undefined;
  await vi.waitFor(
    async () => {
      latest = await test.runs.runs.find(run.userId, run.id);
      if (latest?.queueState !== state) throw new Error(`The run is not ${state}`);
    },
    { interval: 2, timeout: 20_000 },
  );
  if (latest === undefined) throw new Error('The run vanished');
  return latest;
}

/** Amy's project: a finished understand, a saved brief and a Deepen paused with nothing left. */
async function setup() {
  const journeys = new MemoryJourneyRecords();
  const test = createTestServer({ journeys });
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const userId = actorOf(user.account).userId;
  const project = sampleProject({ userId, settings: plannerSettings(cloud) });
  await test.projects.insertOrFind(project);
  const briefs = new FilePlanningBriefStore({
    writer: test.briefFiles,
    masker: new SecretMasker(),
  });
  await seedPlanSource({ files: test.answerFiles, briefs, runs: test.runs.runs }, project, {});
  await journeys.save({ userId, projectId: project.id, approved, createdAt: 0 });
  const deepen = sampleRun({
    ...{ userId, projectId: project.id, stage: 'understand', queueState: 'AwaitingApproval' },
    runKey: '20261012-120000-understand',
    totals: { ...{ costMicros: approved.costMicros, inputTokens: approved.tokens }, ...noCache },
  });
  const inserted = await test.runs.runs.insert(deepen);
  if (!inserted.ok) throw new Error('The Deepen was not seeded');
  const options = { cloudConsent: true, approvedAmount: approved };
  const manifest = sampleManifest({ runId: deepen.runKey, stage: 'understand', options });
  await test.runs.manifests.write(test.runs.scopeOf(deepen), manifest);
  return { test, project, deepen, amy: await signedInBrowser(test.server, user) };
}

const startPlan = { stage: 'plan', cloudConsent: true } as const;

describe('POST /api/runs/:runId/continue on a step of a journey', () => {
  it('RF-435 P9-01 a Continue followed by a plan start answers 202, not RST-2311', async () => {
    const { test, project, deepen, amy } = await setup();
    const runsUrl = `/api/projects/${project.id}/runs`;
    const before = await amy.request({ method: 'POST', url: runsUrl, payload: startPlan });

    const continued = await amy.request({
      ...{ method: 'POST', url: `/api/runs/${deepen.id}/continue` },
      payload: { extra },
    });
    await stateOf(test, deepen, 'Running');
    test.runs.executor.settle(deepen.id, { endState: 'Completed' });
    await stateOf(test, deepen, 'Ended');
    const after = await amy.request({ method: 'POST', url: runsUrl, payload: startPlan });

    expect(before.statusCode).toBe(409);
    expect(before.json()).toMatchObject({ code: ERROR_CODES.journeyAmountUsed });
    expect(continued.statusCode).toBe(202);
    // P9-14: the room did not shrink, so the run got the whole N.
    expect(continued.json()).toMatchObject({ granted: extra, lessThanOffered: false });
    expect(after.statusCode).toBe(202);
    const plan = await test.runs.runs.find(deepen.userId, after.json<{ id: string }>().id);
    if (plan === undefined) throw new Error('The plan run was not recorded');
    const manifest = await test.runs.manifests.read(test.runs.scopeOf(plan));
    expect(readUnderstandOptions(manifest?.options ?? {}).approvedAmount).toEqual(extra);
  });
});
