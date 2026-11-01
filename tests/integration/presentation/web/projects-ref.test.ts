import { afterEach, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-010, EV-70: the projects API refuses an address whose branch or tag GitHub does not have.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const repository = 'https://github.com/owner/repo';

it('RF-010 EV-70 a branch GitHub does not have answers 400 RST-1901 at the url field and creates nothing', async () => {
  const test = createTestServer({ refCheck: { check: () => Promise.resolve('missing') } });
  current = test;
  const amy = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));

  const response = await amy.request({
    method: 'POST',
    url: '/api/projects',
    payload: { url: `${repository}/tree/master` },
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toMatchObject({
    code: ERROR_CODES.githubRefNotFound,
    problems: [
      {
        field: 'url',
        code: ERROR_CODES.githubRefNotFound,
        reason: 'The branch or tag after /tree/ does not exist in this repository.',
      },
    ],
  });
  const list = await amy.request({ method: 'GET', url: '/api/projects' });
  expect(list.json()).toEqual({ projects: [] });
});
