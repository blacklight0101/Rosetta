import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer, testVersion, type TestServer } from '../../../support/web-server.js';

// RF-1303: GET /healthz, public, 200 with the version when the database answers, else 503.

let current: TestServer | undefined;

function server(): TestServer {
  current = createTestServer();
  return current;
}

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

describe('GET /healthz', () => {
  it('RF-1303 answers 200 with status ok and the Rosetta version when the database answers', async () => {
    const { server: app } = server();

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: testVersion });
  });

  it('RF-1303 answers 503 with no detail when the database does not answer', async () => {
    const { server: app, health } = server();
    health.reachable = false;

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe('');
  });

  it('RF-1303 answers 503 with no detail when the database probe fails', async () => {
    const { server: app, health } = server();
    health.isReachable = () => Promise.reject(new Error('probe failed at postgres://db:5432'));

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe('');
  });

  it('RF-1303 needs no session and sets no cookie', async () => {
    const { server: app } = server();

    const response = await app.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
