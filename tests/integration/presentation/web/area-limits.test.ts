import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  MAX_AREA_NAME,
  MAX_AREAS,
  START_BODY_LIMIT_BYTES,
} from '../../../../src/presentation/web/area-limits.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-200, RF-425, RF-1108 (P1-147): the size limits of a request that names areas agree with the
// schema. A selection the schema allows is never refused by a limit set separately (the owner's
// first test: 42 areas, about 2.5 KB, were refused with RST-2000 by a 1 KiB body limit).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const project = sampleProject({ userId: user.account.id });
  await test.projects.insertOrFind(project);
  return { test, project, amy: await signedInBrowser(test.server, user) };
}

const startUrl = (projectId: string): string => `/api/projects/${projectId}/runs`;
/** A name of the longest allowed length, unique per index. */
const longName = (index: number): string =>
  `${String(index).padStart(4, '0')}${'a'.repeat(MAX_AREA_NAME - 4)}`;
const jsonHeaders = { 'content-type': 'application/json' } as const;

describe('POST /api/projects/:id/runs body limit', () => {
  it('RF-200 starts a run that names a normal selection of 42 long area names', async () => {
    const { amy, project } = await setup();
    const areas = Array.from(
      { length: 42 },
      (_, index) => `Scripts/Sub${String(index)}/${'x'.repeat(50)}`,
    );

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', areas, cloudConsent: false },
    });

    expect(response.statusCode).toBe(202);
  });

  it('RF-200 accepts the largest body the schema allows: every area at the longest length, every character escaped', async () => {
    const { amy, project } = await setup();
    // A control character is written as a six-byte escape, the largest a unit of a name can take.
    const areas = Array.from({ length: MAX_AREAS }, () => '\u0001'.repeat(MAX_AREA_NAME));
    const body = JSON.stringify({ stage: 'understand', areas, cloudConsent: false });

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: body,
      headers: jsonHeaders,
    });

    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(START_BODY_LIMIT_BYTES);
    expect(response.statusCode).toBe(202);
  });
});

describe('POST /api/projects/:id/runs body bounds', () => {
  it('RF-200 accepts a body of exactly the limit and refuses one byte more with RST-2000 (400)', async () => {
    const { amy, project } = await setup();
    const base = JSON.stringify({ stage: 'scan' });
    const pad = (size: number) => base + ' '.repeat(size - Buffer.byteLength(base));

    const at = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: pad(START_BODY_LIMIT_BYTES),
      headers: jsonHeaders,
    });
    const over = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: pad(START_BODY_LIMIT_BYTES + 1),
      headers: jsonHeaders,
    });

    expect(at.statusCode).toBe(202);
    expect(over.statusCode).toBe(400);
    expect(over.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RF-200 refuses one area too many and one character too many with RST-2000 (400)', async () => {
    const { amy, project } = await setup();
    const tooMany = Array.from({ length: MAX_AREAS + 1 }, (_, index) => longName(index));
    const tooLong = ['a'.repeat(MAX_AREA_NAME + 1)];

    for (const areas of [tooMany, tooLong]) {
      const response = await amy.request({
        method: 'POST',
        url: startUrl(project.id),
        payload: { stage: 'understand', areas, cloudConsent: false },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    }
  });
});

/** One GET over a real socket, so the server's request-line limit applies (inject skips it). */
async function getStatus(server: TestServer['server'], path: string): Promise<number> {
  await server.listen({ port: 0, host: '127.0.0.1' });
  const address = server.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return new Promise((resolve, reject) => {
    const call = request(
      { host: '127.0.0.1', port, path, headers: { host: 'localhost' } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    call.on('error', reject);
    call.end();
  });
}

describe('GET /api/projects/:id/estimate query limit', () => {
  it('RF-425 the longest query the schema allows reaches the route: 401 without a session, not a size refusal', async () => {
    const { test, project } = await setup();
    // A name of characters that percent-encode to three characters each is the largest query.
    const name = '/'.repeat(MAX_AREA_NAME);
    const query = Array.from({ length: MAX_AREAS }, () => `areas=${encodeURIComponent(name)}`).join(
      '&',
    );

    const status = await getStatus(test.server, `/api/projects/${project.id}/estimate?${query}`);

    expect(status).toBe(401);
  });
});
