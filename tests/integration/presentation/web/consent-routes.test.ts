import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { heldZip } from '../../../support/upload-run-fixtures.js';
import { createTestServer, testPublicUrl, type TestServer } from '../../../support/web-server.js';

// RF-143, RF-1105, DEC-209 (P8-81): GET /api/projects/:id/consent?for=understand|plan answers the
// consent of the project that holds for the roles of that start, which a page shows as one line;
// DELETE /api/projects/:id/consent withdraws it. Both need a session and are scoped to the signed-in
// user: another user's project answers 404 and keeps its consent.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const DAY_MS = 24 * 60 * 60 * 1000;
const anthropicReader = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});

interface ConsentAnswer {
  readonly consent: {
    readonly id: string;
    readonly givenAt: string;
    readonly endsAt: string;
    readonly providers: readonly string[];
    readonly kinds: readonly string[];
  } | null;
}

async function setup(upload = false) {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const owner = { userId: amyUser.account.id, settings: anthropicReader };
  const project = upload
    ? sampleProject({ ...owner, sourceKind: 'upload', sourceUrl: '', upload: heldZip })
    : sampleProject(owner);
  await test.projects.insertOrFind(project);
  const amy = await signedInBrowser(test.server, amyUser);
  const url = `/api/projects/${project.id}/consent`;
  const start = (payload: Record<string, unknown>) =>
    amy.request({ method: 'POST', url: `/api/projects/${project.id}/runs`, payload });
  return { test, amy, url, start };
}

describe('GET /api/projects/:id/consent (RF-143, P8-81)', () => {
  it('RF-143 P8-81 answers null while no consent holds', async () => {
    const { amy, url } = await setup();

    const read = await amy.request({ method: 'GET', url: `${url}?for=understand` });

    expect(read.statusCode).toBe(200);
    expect(read.json<ConsentAnswer>()).toEqual({ consent: null });
    expect(read.headers['cache-control']).toBe('no-store');
  });

  it('RF-143 P8-81 answers the consent a start gave, with when it was given and when it ends', async () => {
    const { amy, url, start } = await setup();
    expect((await start({ stage: 'understand', cloudConsent: true })).statusCode).toBe(202);

    const read = await amy.request({ method: 'GET', url: `${url}?for=understand` });

    const { consent } = read.json<ConsentAnswer>();
    expect(consent).toMatchObject({ providers: ['anthropic'], kinds: ['cloud'] });
    if (consent === null) throw new Error('No consent');
    expect(Date.parse(consent.endsAt) - Date.parse(consent.givenAt)).toBe(30 * DAY_MS);
  });

  it('RF-143 P8-81 the planner of the project is local, so Plan setup has no consent to show', async () => {
    const { amy, url, start } = await setup();
    await start({ stage: 'understand', cloudConsent: true });

    const read = await amy.request({ method: 'GET', url: `${url}?for=plan` });

    expect(read.json<ConsentAnswer>()).toEqual({ consent: null });
  });
});

describe('GET /api/projects/:id/consent of an upload and its query (RF-132, P8-81)', () => {
  it('RF-132 P8-81 an upload shows the consent that has the private-code kind too', async () => {
    const { amy, url, start } = await setup(true);
    await start({ stage: 'understand', cloudConsent: true, privateCodeConfirmed: true });

    const read = await amy.request({ method: 'GET', url: `${url}?for=understand` });

    expect(read.json<ConsentAnswer>().consent?.kinds).toEqual(['cloud', 'private-code']);
  });

  it('RST-2000 P8-81 a missing or unknown start answers 400', async () => {
    const { amy, url } = await setup();

    const missing = await amy.request({ method: 'GET', url });
    const unknown = await amy.request({ method: 'GET', url: `${url}?for=scan` });

    expect(missing.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });
});

describe('DELETE /api/projects/:id/consent (RF-143, P8-81)', () => {
  it('RF-143 P8-81 withdraws the consent: none holds after it and the next start asks again', async () => {
    const { amy, url, start, test } = await setup();
    await start({ stage: 'understand', cloudConsent: true });

    const withdrawn = await amy.request({ method: 'DELETE', url });

    expect(withdrawn.statusCode).toBe(200);
    expect(withdrawn.json()).toEqual({ withdrawn: 1 });
    const read = await amy.request({ method: 'GET', url: `${url}?for=understand` });
    expect(read.json<ConsentAnswer>()).toEqual({ consent: null });
    const again = await start({ stage: 'understand' });
    expect(again.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(test.runs.executor.started).toHaveLength(1);
  });
});

describe("another user's project (RF-1105, P8-81)", () => {
  it("RF-1105 P8-81 reading or withdrawing another user's consent answers 404 and keeps it", async () => {
    const { test, amy, url, start } = await setup();
    await start({ stage: 'understand', cloudConsent: true });
    const ben = await signedInBrowser(test.server, await addUser(test, { userName: 'ben' }));

    const read = await ben.request({ method: 'GET', url: `${url}?for=understand` });
    const withdrawn = await ben.request({ method: 'DELETE', url });

    expect(read.statusCode).toBe(404);
    expect(withdrawn.statusCode).toBe(404);
    const kept = await amy.request({ method: 'GET', url: `${url}?for=understand` });
    expect(kept.json<ConsentAnswer>().consent).not.toBeNull();
  });

  it('RF-1105 P8-81 a request without a session is refused', async () => {
    const { test, url } = await setup();
    const headers = { origin: testPublicUrl };

    const read = await test.server.inject({ method: 'GET', url: `${url}?for=understand`, headers });
    const withdrawn = await test.server.inject({ method: 'DELETE', url, headers });

    expect(read.statusCode).toBe(401);
    expect(withdrawn.statusCode).toBe(401);
  });
});
