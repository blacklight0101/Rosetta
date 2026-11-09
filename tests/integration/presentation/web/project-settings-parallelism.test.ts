import { afterEach, describe, expect, it } from 'vitest';
import { settingsWith } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-436 (P8-56): the answer of PUT /api/projects/:id/settings tells the page that the save raised
// the parallel readers because the reader moved from a local model to a hosted one.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

describe('project settings: parallelism follows the reader provider', () => {
  it('RF-436 a save that moves an Ollama reader to a hosted one with 1 answers 4 and says so', async () => {
    const test = createTestServer();
    current = test;
    const amy = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));
    const created = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: 'https://github.com/owner/repo' },
    });
    const id: unknown = Reflect.get(created.json(), 'id');

    const saved = await amy.request({
      method: 'PUT',
      url: `/api/projects/${String(id)}/settings`,
      payload: settingsWith({ 'roles.reader.provider': 'anthropic', 'agents.parallelism': 1 }),
    });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      settings: { agents: { parallelism: 4 } },
      parallelismChange: { from: 1, to: 4 },
    });
  });
});
