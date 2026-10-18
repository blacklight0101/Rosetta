import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { loadRecording } from '../../../../src/infrastructure/providers/fake/recording.js';
import { answerRecording } from '../../../support/plan-options-harness.js';
import { seedPlanSource, type PlanSourceSeed } from '../../../support/plan-source-seed.js';
import { sampleProject, templateSettings } from '../../../support/project-fixtures.js';
import { fixtureKey } from '../../../support/provider-key-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import {
  createTestServer,
  type TestServer,
  type TestServerOptions,
} from '../../../support/web-server.js';

// RF-608, RF-609, RF-143, RF-1105: POST /api/projects/:id/plan-options through the server with a
// session. The planner is the real guarded provider factory over a fake adapter that replays a
// recording; the cards are the real card files of a seeded understand run.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const recorded = await loadRecording(
  fileURLToPath(new URL('../../../recordings/fake/plan-options.json', import.meta.url)),
);
const cloudPlanner = settingsFor({ planner: { provider: 'openai', model: 'contract-model' } });

interface Setup {
  readonly seed?: PlanSourceSeed;
  readonly scan?: boolean;
  readonly settings?: typeof templateSettings;
  readonly server?: TestServerOptions;
}

async function setup(given: Setup = {}) {
  const test = createTestServer({ providerRecordings: { ollama: recorded }, ...given.server });
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const project = sampleProject({
    userId: actorOf(amyUser.account).userId,
    settings: given.settings ?? templateSettings,
  });
  await test.projects.insertOrFind(project);
  const briefs = new FilePlanningBriefStore({
    writer: test.briefFiles,
    masker: new SecretMasker(),
  });
  const stores = { files: test.answerFiles, briefs, runs: test.runs.runs };
  await seedPlanSource(stores, project, { brief: false, ...given.seed });
  if (given.scan !== false) {
    const done = { queueState: 'Ended', endState: 'Completed' } as const;
    const scan = sampleRun({
      projectId: project.id,
      userId: project.userId,
      stage: 'scan',
      ...done,
    });
    await test.runs.runs.insert(scan);
  }
  return {
    test,
    project,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const optionsUrl = (projectId: string): string => `/api/projects/${projectId}/plan-options`;

const optionsBody = z.object({
  architecture: z.object({
    recommended: z.string(),
    options: z.array(
      z.object({
        ...{ style: z.string(), strengths: z.array(z.string()), costs: z.array(z.string()) },
        evidence: z.array(z.string()),
      }),
    ),
  }),
  stack: z.array(z.object({ layer: z.string(), options: z.array(z.string()) })),
});

describe('POST /api/projects/:id/plan-options answers', () => {
  it('RF-608 RF-609 gives two styles with evidence and two options for every layer', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({ method: 'POST', url: optionsUrl(project.id) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = optionsBody.parse(response.json());
    expect(body.architecture.recommended).toBe('layered');
    expect(body.architecture.options.map((option) => option.style)).toEqual([
      ...['layered', 'modular-monolith'],
    ]);
    expect(body.architecture.options[0]?.evidence).toEqual(['BR-001', 'FEAT-001', 'INT-001']);
    expect(body.stack).toHaveLength(7);
    for (const layer of body.stack) expect(layer.options).toHaveLength(2);
  });

  it('RF-143 passes the consent of the body to the guards: a cloud planner needs it', async () => {
    const { amy, project } = await setup({
      settings: cloudPlanner,
      server: { providerRecordings: { openai: recorded } },
    });
    await amy.request({
      method: 'PUT',
      url: '/api/account/keys/openai',
      payload: { key: fixtureKey('PlanOptionsAmy') },
    });
    const without = await amy.request({ method: 'POST', url: optionsUrl(project.id) });
    const refused = await amy.request({
      method: 'POST',
      url: optionsUrl(project.id),
      payload: { cloudConsent: false },
    });
    const given = await amy.request({
      method: 'POST',
      url: optionsUrl(project.id),
      payload: { cloudConsent: true },
    });

    expect(without.statusCode).toBe(400);
    expect(without.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(refused.statusCode).toBe(400);
    expect(given.statusCode).toBe(200);
  });
});

describe('POST /api/projects/:id/plan-options refuses', () => {
  it("RF-1105 another user's project is not found, like an unknown id", async () => {
    const { bob, project } = await setup();

    const theirs = await bob.request({ method: 'POST', url: optionsUrl(project.id) });
    const unknown = await bob.request({ method: 'POST', url: optionsUrl(sampleProject().id) });

    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(unknown.statusCode).toBe(404);
  });

  it('RST-1802 a project without a finished understand run answers 409', async () => {
    const { amy, project } = await setup({ seed: { understand: false } });

    const response = await amy.request({ method: 'POST', url: optionsUrl(project.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.planSourceMissing });
  });

  it('RST-1203 a project without a finished scan answers 409', async () => {
    const { amy, project } = await setup({ scan: false });

    const response = await amy.request({ method: 'POST', url: optionsUrl(project.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.codeMapMissing });
  });

  it('RST-2000 a body that is not { cloudConsent } answers 400 before any call', async () => {
    const { amy, project, test } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: optionsUrl(project.id),
      payload: { cloudConsent: 'yes', other: 1 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(test.providerLedger.entries).toHaveLength(0);
  });
});

describe('POST /api/projects/:id/plan-options and the cause of a failure', () => {
  it('RST-2302 a cloud planner with no key to use answers 409, not a server error', async () => {
    const { amy, project } = await setup({ settings: cloudPlanner });

    const response = await amy.request({
      method: 'POST',
      url: optionsUrl(project.id),
      payload: { cloudConsent: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.providerKeyMissing });
  });

  it('RST-1800 an answer that is not options answers 502, not a server error', async () => {
    const { amy, project } = await setup({
      server: { providerRecordings: { ollama: answerRecording('I would rather not say.') } },
    });

    const response = await amy.request({ method: 'POST', url: optionsUrl(project.id) });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.planOptionsInvalid });
  });
});
