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

const estimateUrl = (projectId: string): string => `/api/projects/${projectId}/estimate`;

describe('POST /api/projects/:id/estimate body limit', () => {
  it('RF-425 takes the largest body the schema allows, so a long selection is never a URL problem', async () => {
    const { amy, project } = await setup();
    const areas = Array.from({ length: MAX_AREAS }, () => ''.repeat(MAX_AREA_NAME));
    const body = JSON.stringify({ areas });

    const response = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: body,
      headers: jsonHeaders,
    });

    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(START_BODY_LIMIT_BYTES);
    // The names are not in the code map: the request got past the size and shape checks.
    expect(response.json()).toMatchObject({ code: ERROR_CODES.codeMapMissing });
  });

  it('RF-425 accepts a body of exactly the limit and refuses one byte more with RST-2000 (400)', async () => {
    const { amy, project } = await setup();
    const base = JSON.stringify({ areas: ['Catalog'] });
    const pad = (size: number) => base + ' '.repeat(size - Buffer.byteLength(base));

    const at = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: pad(START_BODY_LIMIT_BYTES),
      headers: jsonHeaders,
    });
    const over = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: pad(START_BODY_LIMIT_BYTES + 1),
      headers: jsonHeaders,
    });

    expect(at.json()).toMatchObject({ code: ERROR_CODES.codeMapMissing });
    expect(over.statusCode).toBe(400);
    expect(over.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });
});

describe('the area name limit', () => {
  it('RF-200 a name of 1024 characters, the longest the code map holds, is accepted by start and estimate', async () => {
    const { amy, project } = await setup();
    const areas = ['a'.repeat(1024)];

    const start = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', areas, cloudConsent: false },
    });
    const estimate = await amy.request({
      method: 'POST',
      url: estimateUrl(project.id),
      payload: { areas },
    });

    expect(start.statusCode).toBe(202);
    expect(estimate.json()).toMatchObject({ code: ERROR_CODES.codeMapMissing });
  });
});
