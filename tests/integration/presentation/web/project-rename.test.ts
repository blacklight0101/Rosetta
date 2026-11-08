import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-010, RF-1009, RF-1105, P8-134, DEC-222: `PUT /api/projects/:id/name` renames a project of the
// signed-in user, through the server with memory adapters, a session, the public Origin and a CSRF
// token. The name is checked as at creation (RST-2000); another user's id answers 404 like an
// unknown one; a refused request changes nothing.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly id: string;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const amy = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));
  const bob = await signedInBrowser(test.server, await addUser(test, { userName: 'bob' }));
  const created = await amy.request({
    method: 'POST',
    url: '/api/projects',
    payload: { url: 'https://github.com/owner/repo' },
  });
  const id: unknown = Reflect.get(created.json<object>(), 'id');
  if (typeof id !== 'string') throw new Error(`The project was not created: ${created.body}`);
  return { amy, bob, id };
}

async function nameOf(browser: TestBrowser, id: string): Promise<unknown> {
  const response = await browser.request({ method: 'GET', url: `/api/projects/${id}` });
  return Reflect.get(response.json<object>(), 'name');
}

const rename = (
  browser: TestBrowser,
  id: string,
  payload: Readonly<Record<string, unknown>>,
  csrf?: false,
) =>
  browser.request({
    method: 'PUT',
    url: `/api/projects/${id}/name`,
    payload,
    ...(csrf === false ? { csrf } : {}),
  });

describe('PUT /api/projects/:id/name', () => {
  it('RF-010 the owner renames the project: 200 with the project, and the list and the page read the new name', async () => {
    const { amy, id } = await setup();

    const response = await rename(amy, id, { name: '  Order Desk  ' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id,
      name: 'Order Desk',
      sourceUrl: 'https://github.com/owner/repo',
      settingsVersion: 1,
    });
    expect(await nameOf(amy, id)).toBe('Order Desk');
    const list = await amy.request({ method: 'GET', url: '/api/projects' });
    expect(list.json()).toMatchObject({ projects: [{ id, name: 'Order Desk' }] });
  });

  it("RF-1105 another user's project id answers 404 like an unknown one and the name stays", async () => {
    const { amy, bob, id } = await setup();

    const foreign = await rename(bob, id, { name: 'Taken' });
    const unknown = await rename(amy, '00000000-0000-4000-a000-00000000ffff', { name: 'Taken' });

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(unknown.statusCode).toBe(404);
    expect(foreign.json()).toEqual(unknown.json());
    expect(await nameOf(amy, id)).toBe('owner/repo');
  });
});

describe('PUT /api/projects/:id/name refusals', () => {
  it.each([
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a name of 201 characters', { name: 'x'.repeat(201) }],
    ['a name with a control character', { name: 'Order\u0007Desk' }],
    ['a name that is not text', { name: 42 }],
    ['a body with another field', { name: 'Order Desk', owner: 'bob' }],
    ['no name', {}],
  ])('RF-010 %s is refused with 400 and RST-2000, and nothing changes', async (_what, body) => {
    const { amy, id } = await setup();

    const response = await rename(amy, id, body);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(await nameOf(amy, id)).toBe('owner/repo');
  });

  it('RF-1009 a rename without the CSRF token is refused with 403 and nothing changes', async () => {
    const { amy, id } = await setup();

    const response = await rename(amy, id, { name: 'Order Desk' }, false);

    expect(response.statusCode).toBe(403);
    expect(await nameOf(amy, id)).toBe('owner/repo');
  });

  it('RF-1009 a rename from another Origin is refused with 403 and nothing changes', async () => {
    const { amy, id } = await setup();

    const response = await amy.request({
      method: 'PUT',
      url: `/api/projects/${id}/name`,
      payload: { name: 'Order Desk' },
      origin: 'https://evil.example',
    });

    expect(response.statusCode).toBe(403);
    expect(await nameOf(amy, id)).toBe('owner/repo');
  });
});
