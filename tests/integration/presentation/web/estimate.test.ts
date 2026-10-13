import type { LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { completedScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-425, RF-1105, RF-1009: GET and POST /api/projects/:id/estimate through the server with a session. The
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

const point = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  costMicros: z.string(),
});
const estimateBody = z.object({
  areas: z.array(
    z.object({ name: z.string(), estimatedTokens: z.number(), thirdParty: z.boolean() }),
  ),
  roles: z.array(z.object({ role: z.string(), low: point, likely: point, high: point }).loose()),
  total: z.object({ low: point, likely: point, high: point }),
});

/** The body of a 200 answer, checked against the shape the page reads. */
function bodyOf(response: LightMyRequestResponse): z.infer<typeof estimateBody> {
  return estimateBody.parse(response.json());
}

const estimateUrl = (projectId: string, query = ''): string =>
  `/api/projects/${projectId}/estimate${query}`;

describe('GET /api/projects/:id/estimate answers', () => {
  it('RF-425 answers the range per role with the assumptions; micro-dollars travel as strings', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currency: 'USD',
      areas: [
        { name: 'Catalog', estimatedTokens: 10_000 },
        { name: 'Orders', estimatedTokens: 4000 },
      ],
      assumptions: { turnsPerArea: { high: 12 }, promptOverheadTokens: 2000 },
    });
    const body = bodyOf(response);
    expect(body.roles.map((role) => role.role)).toEqual(['reader', 'verifier']);
    expect(body.roles[0]).toMatchObject({
      provider: 'ollama',
      model: 'gemma4:e4b',
      priced: true,
      low: { costMicros: '0' },
      likely: { costMicros: '0' },
      high: { costMicros: '0' },
    });
    expect(body.roles[0]?.likely.inputTokens).toBeGreaterThan(0);
    expect(body.total.high.costMicros).toBe('0');
  });

  it('RF-425 the areas in the body limit the estimate', async () => {
    const { amy, project } = await setup();

    const one = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: { areas: ['Orders'] },
    });
    const both = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: { areas: ['Orders', 'Catalog'] },
    });

    expect(bodyOf(one).areas).toEqual([
      { name: 'Orders', estimatedTokens: 4000, thirdParty: false },
    ]);
    expect(bodyOf(both).areas.map((area) => area.name)).toEqual(['Catalog', 'Orders']);
  });
});

describe('POST /api/projects/:id/estimate refuses', () => {
  it('RST-1307 an unknown area is refused with 400, like the understand run', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: { areas: ['Nowhere'] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.areaUnknown });
  });

  it.each([{ areas: [''] }, { areas: [] }, { areas: 'Catalog' }, { areas: ['Catalog'], x: 1 }])(
    'RF-425 a body that is not a list of area names (%j) is a bad request (RST-2000)',
    async (payload) => {
      const { amy, project } = await setup();

      const response = await amy.request({
        method: 'POST',
        url: estimateUrl(project.id),
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    },
  );
});

describe('POST /api/projects/:id/estimate and the session', () => {
  it('RF-1009 requires a session and the CSRF token', async () => {
    const { test, amy, project } = await setup();

    const anonymous = await new TestBrowser(test.server).request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: { areas: ['Orders'] },
      csrf: false,
    });
    const noToken = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: { areas: ['Orders'] },
      csrf: false,
    });

    expect(anonymous.statusCode).toBe(401);
    expect(noToken.statusCode).toBe(403);
  });

  it('RF-1105 another user project answers 404 like an unknown one', async () => {
    const { bob, project } = await setup();

    const other = await bob.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: { areas: ['Orders'] },
    });

    expect(other.statusCode).toBe(404);
  });
});

describe('GET /api/projects/:id/estimate refuses unknown parameters', () => {
  it.each([
    '?areas[]=Catalog',
    '?area=Catalog',
    '?areas=Catalog',
    '?areas=Catalog&stage=understand',
  ])(
    'RF-425 an unknown query parameter (%s) is refused with RST-2000 and names the parameter',
    async (query) => {
      const { amy, project } = await setup();

      const response = await amy.request({ method: 'GET', url: estimateUrl(project.id, query) });

      expect(response.statusCode).toBe(400);
      const body = z
        .object({
          code: z.string(),
          problems: z.array(z.object({ field: z.string(), code: z.string(), reason: z.string() })),
        })
        .parse(response.json());
      expect(body.code).toBe(ERROR_CODES.requestInvalid);
      expect(body.problems).toHaveLength(1);
      expect(body.problems[0]?.reason).toMatch(
        /^Unknown query parameter ".+"\. To estimate some areas, POST/u,
      );
    },
  );

  it('RST-1203 a project that was never scanned answers 409 with the code', async () => {
    const { amy, project } = await setup(false);

    const response = await amy.request({ method: 'GET', url: estimateUrl(project.id) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.codeMapMissing });
  });
});

describe('GET /api/projects/:id/estimate and the owner', () => {
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
