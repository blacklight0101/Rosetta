import { afterEach, describe, expect, it } from 'vitest';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, testVersion, type TestServer } from '../../../support/web-server.js';

// RF-1303: GET /healthz, public, 200 with the version when the database answers, else 503.
// RF-1009: a public route never looks up the session, so a session cookie cannot turn the 503 of
// a database outage into a 500.

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

describe('GET /healthz with a session cookie', () => {
  it('RF-1303 answers 503 with a session cookie while the database is down', async () => {
    const test = server();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);
    test.health.reachable = false;
    test.sessions.touch = () => Promise.reject(new Error('connect ECONNREFUSED db:5432'));

    const response = await browser.request({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(503);
    expect(response.body).toBe('');
  });
});
