import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// P7-29, RF-609, RF-1105: GET /api/projects/:id/stack-offer needs a session and is the owner's only.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const urlOf = (id: string): string => `/api/projects/${id}/stack-offer`;

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const mine = sampleProject({ userId: actorOf(amyUser.account).userId });
  const theirs = sampleProject({ userId: actorOf(bobUser.account).userId });
  await test.projects.insertOrFind(mine);
  await test.projects.insertOrFind(theirs);
  return { test, mine, theirs, amy: await signedInBrowser(test.server, amyUser) };
}

describe('GET /api/projects/:id/stack-offer', () => {
  it('RF-609 gives the owner the seven layers, uncached', async () => {
    const { amy, mine } = await setup();
    const response = await amy.request({ method: 'GET', url: urlOf(mine.id) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toHaveProperty('layers');
  });

  it('RF-1105 answers 401 without a session', async () => {
    const { test, mine } = await setup();
    const response = await test.server.inject({ method: 'GET', url: urlOf(mine.id) });
    expect(response.statusCode).toBe(401);
  });

  it('RF-1105 answers 404 for another user project', async () => {
    const { amy, theirs } = await setup();
    const response = await amy.request({ method: 'GET', url: urlOf(theirs.id) });
    expect(response.statusCode).toBe(404);
  });
});
