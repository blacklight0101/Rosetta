import { afterEach, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// DEC-106, RF-1106, RF-1109, P1-42: the administrator reads and sets the default models per role
// for new projects under /api/admin/default-roles. A role left out keeps the template's model; a
// change writes an audit row and is used by the next project that is created.

let test: TestServer;

afterEach(async () => {
  await test.server.close();
});

async function signedIn(userName: string, role: 'user' | 'admin'): Promise<TestBrowser> {
  return signedInBrowser(test.server, await addUser(test, { userName, role }));
}

const roles = {
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' },
};

it('DEC-106 the administrator reads no default models until they are set', async () => {
  test = createTestServer();
  const root = await signedIn('root', 'admin');

  const response = await root.request({ method: 'GET', url: '/api/admin/default-roles' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ roles: {} });
});

it('DEC-106 the administrator sets the default models; the change is kept and audited', async () => {
  test = createTestServer();
  const root = await signedIn('root', 'admin');

  const saved = await root.request({
    method: 'PUT',
    url: '/api/admin/default-roles',
    payload: { roles },
  });
  const read = await root.request({ method: 'GET', url: '/api/admin/default-roles' });

  expect(saved.statusCode).toBe(200);
  expect(saved.json()).toEqual({ roles });
  expect(read.json()).toEqual({ roles });
  const [event] = await test.audit.list({ since: 0, action: 'admin.default_roles_changed' });
  expect(event).toMatchObject({ outcome: 'ok', targetId: 'defaultRoles' });
  expect(event?.detail).toMatchObject({ reader: 'ollama/gemma4:e4b', planner: 'template' });
});

it.each([
  [
    'an unknown provider',
    { reader: { provider: 'nowhere', model: 'x' } },
    [{ field: 'reader.provider', code: ERROR_CODES.settingsProviderUnknown }],
  ],
  [
    'an empty model',
    { verifier: { provider: 'openai', model: '  ' } },
    [{ field: 'verifier.model', code: ERROR_CODES.settingsModelMissing }],
  ],
  [
    'a missing model',
    { planner: { provider: 'openai' } },
    [{ field: 'planner.model', code: ERROR_CODES.settingValueInvalid }],
  ],
  [
    'an unknown role',
    { editor: { provider: 'openai', model: 'x' } },
    [{ field: 'editor', code: ERROR_CODES.settingValueInvalid }],
  ],
  [
    'two problems at once',
    {
      reader: { provider: 'nowhere', model: '' },
      summariser: { provider: 'openai', model: 'ok' },
    },
    [
      { field: 'reader.model', code: ERROR_CODES.settingsModelMissing },
      { field: 'reader.provider', code: ERROR_CODES.settingsProviderUnknown },
    ],
  ],
])(
  'DEC-106 %s is refused with its field and code, and nothing changes',
  async (_name, refusedRoles, problems) => {
    test = createTestServer();
    const root = await signedIn('root', 'admin');

    const refused = await root.request({
      method: 'PUT',
      url: '/api/admin/default-roles',
      payload: { roles: refusedRoles },
    });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.settingsInvalid, problems });
    const read = await root.request({ method: 'GET', url: '/api/admin/default-roles' });
    expect(read.json()).toEqual({ roles: {} });
  },
);

it('DEC-106 a body that is not an object of roles is refused with RST-2000', async () => {
  test = createTestServer();
  const root = await signedIn('root', 'admin');

  const refused = await root.request({
    method: 'PUT',
    url: '/api/admin/default-roles',
    payload: { roles: 'reader' },
  });

  expect(refused.statusCode).toBe(400);
  expect(refused.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
});

it('RF-1105 a user is refused with 403 on both routes', async () => {
  test = createTestServer();
  const user = await signedIn('ana', 'user');

  const read = await user.request({ method: 'GET', url: '/api/admin/default-roles' });
  const write = await user.request({
    method: 'PUT',
    url: '/api/admin/default-roles',
    payload: { roles },
  });

  expect([read.statusCode, write.statusCode]).toEqual([403, 403]);
});
