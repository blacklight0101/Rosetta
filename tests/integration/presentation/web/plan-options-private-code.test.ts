import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { SourceKind } from '../../../../src/domain/sources/source-kind.js';
import { FilePlanningBriefStore } from '../../../../src/infrastructure/files/file-planning-brief-store.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { loadRecording } from '../../../../src/infrastructure/providers/fake/recording.js';
import { seedPlanSource } from '../../../support/plan-source-seed.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { fixtureKey } from '../../../support/provider-key-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-132, RF-143, DEC-148: POST /api/projects/:id/plan-options on a project of kind `upload` with
// a cloud planner needs the second confirmation besides the cloud consent; a GitHub project does not.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const recorded = await loadRecording(
  fileURLToPath(new URL('../../../recordings/fake/plan-options.json', import.meta.url)),
);
const cloudPlanner = settingsFor({ planner: { provider: 'openai', model: 'contract-model' } });

async function setup(kind: SourceKind) {
  const test = createTestServer({ providerRecordings: { openai: recorded } });
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const owner = { userId: actorOf(amyUser.account).userId, settings: cloudPlanner };
  const project =
    kind === 'upload'
      ? sampleProject({ ...owner, sourceKind: 'upload', sourceUrl: '' })
      : sampleProject(owner);
  await test.projects.insertOrFind(project);
  const briefs = new FilePlanningBriefStore({
    writer: test.briefFiles,
    masker: new SecretMasker(),
  });
  const stores = { files: test.answerFiles, briefs, runs: test.runs.runs };
  await seedPlanSource(stores, project, { brief: false });
  const done = { queueState: 'Ended', endState: 'Completed' } as const;
  const scan = sampleRun({ projectId: project.id, userId: project.userId, stage: 'scan', ...done });
  await test.runs.runs.insert(scan);
  const amy = await signedInBrowser(test.server, amyUser);
  await amy.request({
    method: 'PUT',
    url: '/api/account/keys/openai',
    payload: { key: fixtureKey('PlanOptionsAmy') },
  });
  return { amy, url: `/api/projects/${project.id}/plan-options` };
}

describe('POST /api/projects/:id/plan-options and the private code of an upload', () => {
  it('RF-132 refuses an upload with a cloud planner and the consent but no confirmation', async () => {
    const { amy, url } = await setup('upload');

    const response = await amy.request({ method: 'POST', url, payload: { cloudConsent: true } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.privateCodeNotConfirmed });
  });

  it('RF-132 keeps the consent first: no consent answers RST-1515', async () => {
    const { amy, url } = await setup('upload');

    const response = await amy.request({
      method: 'POST',
      url,
      payload: { privateCodeConfirmed: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
  });

  it('RF-143 neither confirmation given answers RST-1515, the RF-143 refusal unchanged', async () => {
    const { amy, url } = await setup('upload');

    const response = await amy.request({ method: 'POST', url });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
  });
});

describe('POST /api/projects/:id/plan-options with the confirmations given', () => {
  it('RF-132 answers the options when both confirmations are given', async () => {
    const { amy, url } = await setup('upload');

    const response = await amy.request({
      method: 'POST',
      url,
      payload: { cloudConsent: true, privateCodeConfirmed: true },
    });

    expect(response.statusCode).toBe(200);
  });

  it('RF-132 a GitHub project needs the consent alone', async () => {
    const { amy, url } = await setup('github');

    const response = await amy.request({ method: 'POST', url, payload: { cloudConsent: true } });

    expect(response.statusCode).toBe(200);
  });
});
