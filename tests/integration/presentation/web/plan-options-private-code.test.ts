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

  it('RF-132 RST-1521 says where to confirm: the project, then try again (P8-98)', async () => {
    const { amy, url } = await setup('upload');

    const response = await amy.request({ method: 'POST', url, payload: { cloudConsent: true } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.privateCodeNotConfirmed,
      nextStep: 'Give the private code confirmation for this project, then try again.',
    });
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

// RF-143, RF-132, DEC-209 (P8-81): Plan setup shows one consent line while a consent of the project
// holds for the planner, so its options are asked without the boxes.
describe('POST /api/projects/:id/plan-options under a consent of the project', () => {
  it('RF-143 P8-81 options asked with the consent give one, and the next ask needs no box', async () => {
    const { amy, url } = await setup('github');
    const first = await amy.request({ method: 'POST', url, payload: { cloudConsent: true } });
    expect(first.statusCode).toBe(200);

    const again = await amy.request({ method: 'POST', url });

    expect(again.statusCode).toBe(200);
  });

  it('RF-132 P8-81 an upload under a consent that holds needs neither box', async () => {
    const { amy, url } = await setup('upload');
    const payload = { cloudConsent: true, privateCodeConfirmed: true };
    expect((await amy.request({ method: 'POST', url, payload })).statusCode).toBe(200);

    const again = await amy.request({ method: 'POST', url });

    expect(again.statusCode).toBe(200);
  });

  it('RF-143 P8-81 after a withdrawal the options need the consent again (RST-1515)', async () => {
    const { amy, url } = await setup('github');
    await amy.request({ method: 'POST', url, payload: { cloudConsent: true } });
    const consentUrl = url.replace(/plan-options$/u, 'consent');
    expect((await amy.request({ method: 'DELETE', url: consentUrl })).statusCode).toBe(200);

    const again = await amy.request({ method: 'POST', url });

    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
  });
});
