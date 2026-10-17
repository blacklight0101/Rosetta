import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunEndState } from '../../../../src/domain/runs/run-states.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settledRun } from '../../../support/run-settled.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-006, RF-1105, RF-1009, RF-007: POST /api/runs/:runId/resume through the server with a session,
// the public Origin and a CSRF token. The run is queued again: 202 with the run and its position.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const project = sampleProject({ userId: amyUser.account.id });
  await test.projects.insertOrFind(project);
  const amy = await signedInBrowser(test.server, amyUser);
  const bob = await signedInBrowser(test.server, bobUser);

  async function ended(stage: 'scan' | 'understand', endState: RunEndState): Promise<string> {
    const started = await amy.request({
      method: 'POST',
      url: `/api/projects/${project.id}/runs`,
      payload: { stage },
    });
    const { id } = started.json<{ id: string }>();
    test.runs.executor.settle(id, { endState });
    const run = await test.runs.runs.find(amyUser.account.id, id);
    if (run === undefined) throw new Error('The run vanished');
    await settledRun(test.runs, run);
    return id;
  }
  return { test, amy, bob, ended };
}

const resumeUrl = (runId: string): string => `/api/runs/${runId}/resume`;

describe('POST /api/runs/:runId/resume', () => {
  it('RF-006 queues the run that stopped at its cap again and answers 202 with the same run', async () => {
    const { test, amy, ended } = await setup();
    const id = await ended('understand', 'CapReached');

    const response = await amy.request({ method: 'POST', url: resumeUrl(id) });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      id,
      stage: 'understand',
      queueState: 'Running',
      endState: null,
      position: null,
    });
    expect(response.body).not.toContain('userId');
    expect(test.runs.executor.started).toHaveLength(2);
  });

  it('RF-006 answers 409 RST-2307 for a run that completed, and for a second Resume', async () => {
    const { amy, ended } = await setup();
    const completed = await ended('understand', 'Completed');

    const refused = await amy.request({ method: 'POST', url: resumeUrl(completed) });

    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.runNotResumable });
  });
});

describe('POST /api/runs/:runId/resume, refusals', () => {
  it('RF-006 answers 409 for a run that is already running again', async () => {
    const { amy, ended } = await setup();
    const id = await ended('understand', 'Failed');
    await amy.request({ method: 'POST', url: resumeUrl(id) });

    const second = await amy.request({ method: 'POST', url: resumeUrl(id) });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: ERROR_CODES.runNotResumable });
  });
});

describe('POST /api/runs/:runId/resume, who may', () => {
  it('RF-1105 answers 404 for another user run and for an unknown id', async () => {
    const { test, bob, ended } = await setup();
    const id = await ended('understand', 'CapReached');

    const other = await bob.request({ method: 'POST', url: resumeUrl(id) });
    const unknown = await bob.request({
      method: 'POST',
      url: resumeUrl('00000000-0000-4000-b000-ffffffffffff'),
    });

    expect(other.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(test.runs.executor.started).toHaveLength(1);
  });

  it('RF-1009 answers 401 without a session', async () => {
    const { test, ended } = await setup();
    const id = await ended('understand', 'CapReached');

    const response = await new TestBrowser(test.server).request({
      method: 'POST',
      url: resumeUrl(id),
    });

    expect(response.statusCode).toBe(401);
    expect(test.runs.executor.started).toHaveLength(1);
  });

  it('RF-1009 refuses a request without a CSRF token or from another origin', async () => {
    const { test, amy, ended } = await setup();
    const id = await ended('understand', 'CapReached');

    const noToken = await amy.request({ method: 'POST', url: resumeUrl(id), csrf: false });
    const foreign = await amy.request({
      method: 'POST',
      url: resumeUrl(id),
      origin: 'https://evil.example',
    });

    expect(noToken.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
    expect(foreign.json()).toMatchObject({ code: ERROR_CODES.originRefused });
    expect(test.runs.executor.started).toHaveLength(1);
  });
});
