import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from '../support/web-server.js';

// RF-1105, RF-1009: the access matrix compares its rows with the routes the test server records.
// The record must hold every route, wildcards included, so a route added without a row fails the
// matrix instead of passing unseen (the printed listing of Fastify loses the path before `*`).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

describe('the routes recorded by the test server', () => {
  it('RF-1105 hold the run file wildcard route with its whole url', async () => {
    current = createTestServer();
    await current.server.ready();

    expect(current.routes()).toContain('GET /runs/:runId/files/*');
  });

  it('RF-1105 hold a wildcard route added without a matrix row, whatever its method', async () => {
    current = createTestServer();
    current.server.get('/secret/*', () => 'ok');
    current.server.post('/other/*', () => 'ok');
    await current.server.ready();

    expect(current.routes()).toEqual(
      expect.arrayContaining(['GET /secret/*', 'HEAD /secret/*', 'POST /other/*']),
    );
  });
});
