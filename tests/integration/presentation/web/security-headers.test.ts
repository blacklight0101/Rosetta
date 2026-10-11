import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1013, RF-1201: the security headers and noindex on every response, through fastify.inject.

const staticRoot = fileURLToPath(new URL('../../../fixtures/static-site/', import.meta.url));

const cspDirectives = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
];

/** The directives of a Content-Security-Policy header, in order. */
function directives(header: unknown): string[] {
  return String(header)
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive !== '');
}

/** One response of each kind: a route, a text file, a static file, a 404 and a 500. */
const responses = ['/healthz', '/robots.txt', '/index.html', '/no-such-page', '/test/failure'];

let current: TestServer | undefined;

function serverFor(publicUrl: string): TestServer {
  current = createTestServer({ publicUrl, staticRoot });
  current.server.get('/test/failure', () => {
    throw new Error('the failure route always fails');
  });
  return current;
}

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

describe('security headers', () => {
  it.each(responses)(
    'RF-1013 %s carries the content security policy, nosniff and no-referrer',
    async (url) => {
      const { server } = serverFor('http://127.0.0.1:8080');

      const response = await server.inject({ method: 'GET', url });

      expect(directives(response.headers['content-security-policy'])).toEqual(cspDirectives);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-frame-options']).toBe('DENY');
    },
  );

  it.each(responses)(
    'RF-1013 %s carries Strict-Transport-Security when the public URL is https',
    async (url) => {
      const { server } = serverFor('https://rosetta.example.org');

      const response = await server.inject({ method: 'GET', url });

      expect(response.headers['strict-transport-security']).toBe('max-age=31536000');
    },
  );

  it('RF-1013 sends no Strict-Transport-Security when the public URL is http', async () => {
    const { server } = serverFor('http://127.0.0.1:8080');

    const response = await server.inject({ method: 'GET', url: '/healthz' });

    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('RF-1013 serves the built front end from the static folder', async () => {
    const { server } = serverFor('http://127.0.0.1:8080');

    const response = await server.inject({ method: 'GET', url: '/index.html' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Static front-end fixture');
  });
});

describe('search engines', () => {
  it.each(responses)('RF-1201 %s carries X-Robots-Tag: noindex, nofollow', async (url) => {
    const { server } = serverFor('http://127.0.0.1:8080');

    const response = await server.inject({ method: 'GET', url });

    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('RF-1201 robots.txt disallows everything', async () => {
    const { server } = serverFor('http://127.0.0.1:8080');

    const response = await server.inject({ method: 'GET', url: '/robots.txt' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.body).toBe('User-agent: *\nDisallow: /\n');
  });
});
