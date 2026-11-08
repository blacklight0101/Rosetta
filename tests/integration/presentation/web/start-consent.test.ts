import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { settledRun } from '../../../support/run-settled.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { heldZip } from '../../../support/upload-run-fixtures.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-143, RF-209, RF-132, DEC-209: the start routes take a consent given on the project. A run
// started with the boxes gives it; a later run or Deepen of the project starts without them while
// it holds; a role whose provider changed asks again (RST-1515, RST-1521).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const anthropicReader = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});
const openaiReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });

async function setup(upload = false) {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const userId = amyUser.account.id;
  const owner = { userId, settings: anthropicReader };
  const project = upload
    ? sampleProject({ ...owner, sourceKind: 'upload', sourceUrl: '', upload: heldZip })
    : sampleProject(owner);
  await test.projects.insertOrFind(project);
  const amy = await signedInBrowser(test.server, amyUser);
  /** Starts an understand run with the payload and lets it end `Completed`; its id. */
  const completed = async (payload: Record<string, unknown>): Promise<string> => {
    const url = `/api/projects/${project.id}/runs`;
    const started = await amy.request({ method: 'POST', url, payload });
    expect(started.statusCode).toBe(202);
    const { id } = started.json<{ id: string }>();
    test.runs.executor.settle(id, { endState: 'Completed' });
    const run = await test.runs.runs.find(userId, id);
    if (run === undefined) throw new Error('The run vanished');
    await settledRun(test.runs, run);
    return id;
  };
  const changeTo = async (settings: ProjectSettings): Promise<void> => {
    const change = { userId, projectId: project.id, settings, updatedAt: 0 };
    await test.projects.updateSettings({ ...change, expectedVersion: undefined });
  };
  return { test, amy, project, completed, changeTo, startUrl: `/api/projects/${project.id}/runs` };
}

describe('POST /api/projects/:id/runs under a consent of the project (RF-143, DEC-209)', () => {
  it('RF-143 a run started with the consent lets the next run start without it', async () => {
    const { amy, completed, startUrl } = await setup();
    await completed({ stage: 'understand', cloudConsent: true });

    const again = await amy.request({
      method: 'POST',
      url: startUrl,
      payload: { stage: 'understand' },
    });

    expect(again.statusCode).toBe(202);
  });

  it("RF-143 changing a role's provider asks again with RST-1515 (400)", async () => {
    const { amy, completed, changeTo, startUrl, test } = await setup();
    await completed({ stage: 'understand', cloudConsent: true });
    await changeTo(openaiReader);

    const again = await amy.request({
      method: 'POST',
      url: startUrl,
      payload: { stage: 'understand' },
    });

    expect(again.statusCode).toBe(400);
    expect(again.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(test.runs.executor.started).toHaveLength(1);
  });
});

describe('POST /api/runs/:runId/deepen under a consent of the project (RF-209, DEC-209)', () => {
  it('RF-209 a Deepen starts without the boxes while the consent of an upload holds', async () => {
    const { amy, completed } = await setup(true);
    const id = await completed({
      ...{ stage: 'understand', cloudConsent: true, privateCodeConfirmed: true },
    });

    const deepen = await amy.request({
      method: 'POST',
      url: `/api/runs/${id}/deepen`,
      payload: { confirmed: true },
    });

    expect(deepen.statusCode).toBe(202);
  });

  it("RF-209 a Deepen after a role's provider changed asks again with RST-1515 (400)", async () => {
    const { amy, completed, changeTo } = await setup();
    const id = await completed({ stage: 'understand', cloudConsent: true });
    await changeTo(openaiReader);

    const deepen = await amy.request({
      method: 'POST',
      url: `/api/runs/${id}/deepen`,
      payload: { confirmed: true },
    });

    expect(deepen.statusCode).toBe(400);
    expect(deepen.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
  });
});
