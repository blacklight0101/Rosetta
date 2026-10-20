import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-007, RF-1108, RNF-008 (P1-147): GET /api/errors/:code gives the catalogue's message and next
// step for a code, so the live run page can say in words why a run ended (RST-1901 and every other
// code), as the error banners do.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  return { test, amy: await signedInBrowser(test.server, user) };
}

describe('GET /api/errors/:code', () => {
  it('RF-007 RST-1901 answers the code with its catalogue message and next step', async () => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'GET', url: '/api/errors/RST-1901' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      code: ERROR_CODES.githubRefNotFound,
      ...describeError(ERROR_CODES.githubRefNotFound),
    });
  });

  it('RF-002 RST-1007 (a stale settings save) is in the catalogue the pages read', async () => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'GET', url: '/api/errors/RST-1007' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      code: ERROR_CODES.settingsVersionStale,
      ...describeError(ERROR_CODES.settingsVersionStale),
    });
  });

  it.each(['RST-9999', 'RST-19', 'nonsense', 'RST-1901x'])(
    'RF-007 the code %s is not in the catalogue and answers 404 RST-2003',
    async (code) => {
      const { amy } = await setup();

      const response = await amy.request({ method: 'GET', url: `/api/errors/${code}` });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
    },
  );

  it('RF-1009 requires a session', async () => {
    const test = createTestServer();
    current = test;

    const response = await test.server.inject({ method: 'GET', url: '/api/errors/RST-1901' });

    expect(response.statusCode).toBe(401);
  });
});

describe('GET /api/errors/RST-1522', () => {
  it('RF-401 DEC-155 answers the prompt-size code with the remedies the run page shows', async () => {
    const { amy } = await setup();

    const response = await amy.request({ method: 'GET', url: '/api/errors/RST-1522' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      code: ERROR_CODES.ollamaPromptTooLarge,
      ...describeError(ERROR_CODES.ollamaPromptTooLarge),
    });
  });
});
