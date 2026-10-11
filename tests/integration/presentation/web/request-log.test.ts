import { afterEach, describe, expect, it } from 'vitest';
import { secretCases } from '../../../support/secret-fixture.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-009: one masked `http` entry per request through the Logger port; RF-1100: the client IP
// follows ROSETTA_TRUST_PROXY (the rate limits and the audit read it).

let current: TestServer | undefined;

function server(trustProxy: number): TestServer {
  current = createTestServer({ trustProxy });
  current.server.get('/test/ip', (request) => ({ ip: request.ip }));
  return current;
}

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const fakeKey = secretCases.find((secretCase) => secretCase.kind === 'api-key')?.secrets[0] ?? '';

describe('request log', () => {
  it('RF-009 each request writes one http entry with the method, the path and the status', async () => {
    const { server: app, logger } = server(0);

    await app.inject({ method: 'GET', url: '/healthz' });

    const httpEntries = logger.entries.filter((entry) => entry.logger === 'http');
    expect(httpEntries).toHaveLength(1);
    expect(httpEntries[0]).toMatchObject({
      level: 'info',
      data: { method: 'GET', url: '/healthz', statusCode: 200 },
    });
  });

  it('RF-009 a secret in the request address is masked in the log', async () => {
    expect(fakeKey).not.toBe('');
    const { server: app, logger } = server(0);

    await app.inject({ method: 'GET', url: `/no-such-page?key=${fakeKey}` });

    expect(logger.text()).not.toContain(fakeKey);
    expect(logger.text()).toContain('[MASKED:api-key]');
  });
});

describe('client address', () => {
  it('RF-1100 is the connecting address when ROSETTA_TRUST_PROXY is 0', async () => {
    const { server: app } = server(0);

    const response = await app.inject({
      method: 'GET',
      url: '/test/ip',
      remoteAddress: '198.51.100.20',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });

    expect(response.json()).toEqual({ ip: '198.51.100.20' });
  });

  it('RF-1100 is the address forwarded by the trusted proxy when ROSETTA_TRUST_PROXY is 1', async () => {
    const { server: app } = server(1);

    const response = await app.inject({
      method: 'GET',
      url: '/test/ip',
      remoteAddress: '198.51.100.20',
      headers: { 'x-forwarded-for': '192.0.2.99, 203.0.113.7' },
    });

    expect(response.json()).toEqual({ ip: '203.0.113.7' });
  });
});
