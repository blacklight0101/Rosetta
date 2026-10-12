import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { completedScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-425, RF-1105, RF-1009: GET /api/projects/:id/estimate through the server with a session. The
// fixed code map has Catalog (10,000 tokens) and Orders (4,000).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup(scanned = true) {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const project = sampleProject({
    userId: amyUser.account.id,
    settings: settingsFor({ reader: { provider: 'ollama', model: 'gemma4:e4b' } }),
  });
  await test.projects.insertOrFind(project);
  if (scanned) await test.runs.runs.insert(completedScan(project.id, amyUser.account.id));
  return {
    test,
    project,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const estimateUrl = (projectId: string, query = ''): string =>
  `/api/projects/${projectId}/estimate${query}`;

describe('GET /api/projects/:id/estimate', () => {
  it('RF-425 answers the range per role with the assumptions; micro-dollars travel as strings', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      currency: 'USD',
      areas: [
        { name: 'Catalog', estimatedTokens: 10_000 },
        { name: 'Orders', estimatedTokens: 4000 },
      ],
      assumptions: { turnsPerArea: { high: 12 }, promptOverheadTokens: 2000 },
    });
    expect(body.roles.map((role: { role: string }) => role.role)).toEqual(['reader', 'verifier']);
    expect(body.roles[0]).toMatchObject({
      provider: 'ollama',
      model: 'gemma4:e4b',
      priced: true,
      low: { costMicros: '0' },
      likely: { costMicros: '0' },
      high: { costMicros: '0' },
    });
    expect(body.roles[0].likely.inputTokens).toBeGreaterThan(0);
    expect(body.total.high.costMicros).toBe('0');
  });

  it('RF-425 the areas query parameter limits the estimate; a repeated parameter names several', async () => {
    const { amy, project } = await setup();

    const one = await amy.request({ method: 'GET', url: estimateUrl(project.id, '?areas=Orders') });
    const both = await amy.request({
      method: 'GET',
      url: estimateUrl(project.id, '?areas=Orders&areas=Catalog'),
    });

    expect(one.json().areas).toEqual([{ name: 'Orders', estimatedTokens: 4000 }]);
    expect(both.json().areas.map((area: { name: string }) => area.name)).toEqual([
      'Catalog',
      'Orders',
    ]);
  });

  it('RST-1307 an unknown area is refused with 400, like the understand run', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: estimateUrl(project.id, '?areas=Nowhere'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.areaUnknown });
  });

  it('RF-425 an empty area name is a bad request (RST-2000)', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id, '?areas=') });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RST-1203 a project that was never scanned answers 409 with the code', async () => {
    const { amy, project } = await setup(false);

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.codeMapMissing });
  });

  it('RF-1105 another user project answers 404 like an unknown one', async () => {
    const { bob, project } = await setup();

    const other = await bob.request({ method: 'GET', url: estimateUrl(project.id) });
    const unknown = await bob.request({ method: 'GET', url: estimateUrl('not-a-uuid') });

    expect(other.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(other.json()).toEqual(unknown.json());
  });

  it('RF-1009 requires a session', async () => {
    const { test, project } = await setup();

    const response = await new TestBrowser(test.server).request({
      method: 'GET',
      url: estimateUrl(project.id),
    });

    expect(response.statusCode).toBe(401);
  });
});
