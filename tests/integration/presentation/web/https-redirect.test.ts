import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1304, ADR-020: behind the host's proxy (ROSETTA_TRUST_PROXY=1) with an https public URL, a
// request the proxy forwarded with `X-Forwarded-Proto: http` is redirected to the same path on the
// public URL. A request without the header (the host's health check reaching the container
// directly), an untrusted header, or a local http public URL is served as before.

const hostedUrl = 'https://rosetta.example';

let current: TestServer | undefined;

function serve(publicUrl: string, trustProxy: number): TestServer {
  current = createTestServer({ publicUrl, trustProxy });
  return current;
}

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

describe('HTTP to HTTPS redirect behind the proxy', () => {
  it('RF-1304 a GET forwarded as http answers 301 to the https public URL with the same path and query', async () => {
    const { server } = serve(hostedUrl, 1);

    const response = await server.inject({
      method: 'GET',
      url: '/projects?tab=runs',
      headers: { 'x-forwarded-proto': 'http', host: 'evil.example' },
    });

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('https://rosetta.example/projects?tab=runs');
  });

  it('RF-1304 /healthz forwarded as http is redirected too', async () => {
    const { server } = serve(hostedUrl, 1);

    const response = await server.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-proto': 'http' },
    });

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('https://rosetta.example/healthz');
  });

  it('RF-1304 a POST forwarded as http answers 308, which keeps the method, and reaches no route', async () => {
    const { server } = serve(hostedUrl, 1);

    const response = await server.inject({
      method: 'POST',
      url: '/api/session',
      headers: { 'x-forwarded-proto': 'http', origin: hostedUrl },
      payload: { userName: 'nobody', password: 'not-a-real-password' },
    });

    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe('https://rosetta.example/api/session');
  });
});

describe('requests that are not redirected', () => {
  it('RF-1304 a request forwarded as https is served', async () => {
    const { server } = serve(hostedUrl, 1);

    const response = await server.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.location).toBeUndefined();
  });

  it('RF-1303 a request without X-Forwarded-Proto (the host health check) is served', async () => {
    const { server } = serve(hostedUrl, 1);

    const response = await server.inject({ method: 'GET', url: '/healthz' });

    expect(response.statusCode).toBe(200);
  });

  it('RF-1304 the header is ignored when ROSETTA_TRUST_PROXY is 0', async () => {
    const { server } = serve(hostedUrl, 0);

    const response = await server.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-proto': 'http' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('RF-1301 a local http public URL is never redirected', async () => {
    const { server } = serve('http://127.0.0.1:8080', 1);

    const response = await server.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-proto': 'http' },
    });

    expect(response.statusCode).toBe(200);
  });
});
