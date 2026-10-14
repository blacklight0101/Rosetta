import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { settingsWith } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-002, RF-1105 (P1-106): the version of a project's settings. Every project shows its version in
// the body and as the ETag; a save may name the version it started from in If-Match, and one made
// from an older version is refused with RST-1007 instead of overwriting a newer save (two tabs, or
// a cap edit and a settings save).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup(): Promise<{ readonly amy: TestBrowser; readonly bob: TestBrowser }> {
  const test = createTestServer();
  current = test;
  const amy = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));
  const bob = await signedInBrowser(test.server, await addUser(test, { userName: 'bob' }));
  return { amy, bob };
}

async function createdId(browser: TestBrowser): Promise<string> {
  const response = await browser.request({
    method: 'POST',
    url: '/api/projects',
    payload: { url: 'https://github.com/owner/repo' },
  });
  const body: unknown = response.json();
  const id: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'id') : undefined;
  if (typeof id !== 'string') throw new Error(`The project was not created: ${response.body}`);
  return id;
}

const save = (browser: TestBrowser, id: string, parallelism: number, ifMatch?: string) =>
  browser.request({
    method: 'PUT',
    url: `/api/projects/${id}/settings`,
    payload: settingsWith({ 'agents.parallelism': parallelism }),
    ...(ifMatch === undefined ? {} : { headers: { 'if-match': ifMatch } }),
  });

describe('project settings versions', () => {
  it('RF-002 a project shows its settings version in the body and the ETag', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);

    const read = await amy.request({ method: 'GET', url: `/api/projects/${id}` });

    expect(read.json()).toMatchObject({ settingsVersion: 1 });
    expect(read.headers.etag).toBe('"1"');
  });

  it('RF-002 a save with the current version is stored and answers the next version', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);

    const saved = await save(amy, id, 3, '"1"');

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ settingsVersion: 2 });
    expect(saved.headers.etag).toBe('"2"');
  });

  it('RF-002 two tabs: the second save, made from the old version, is refused with RST-1007 and keeps the first', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);
    await save(amy, id, 3, '"1"');

    const stale = await save(amy, id, 5, '"1"');

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      code: ERROR_CODES.settingsVersionStale,
      ...describeError(ERROR_CODES.settingsVersionStale),
    });
    const read = await amy.request({ method: 'GET', url: `/api/projects/${id}` });
    expect(read.json()).toMatchObject({
      settingsVersion: 2,
      settings: { agents: { parallelism: 3 } },
    });
  });
});

describe('project settings versions: unconditional saves and refusals', () => {
  it('RF-002 a save without If-Match still replaces the settings and moves the version', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);

    const saved = await save(amy, id, 3);

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ settingsVersion: 2 });
  });

  it.each(['abc', '"-1"', '"1", "2"', 'W/"1"', '"99999999999999999999"'])(
    'RF-002 the If-Match value %s is not a settings version and answers 400 RST-2000',
    async (value) => {
      const { amy } = await setup();
      const id = await createdId(amy);

      const refused = await save(amy, id, 3, value);

      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    },
  );

  it('RF-1105 another user with the right version still gets 404, never the version check', async () => {
    const { amy, bob } = await setup();
    const id = await createdId(amy);
    await save(amy, id, 3, '"1"');

    const response = await save(bob, id, 5, '"1"');

    expect(response.statusCode).toBe(404);
  });
});
