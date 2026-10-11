import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fallbackSecurityHeaders } from '../../../../src/presentation/web/security-headers.js';
import {
  openRawConnection,
  parseRawResponse,
  parseRawResponses,
  sendRaw,
} from '../../../support/raw-http.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-007, RF-1013, RF-1201, RF-009: requests that Fastify or the Node parser refuse before routing,
// or that Node core would answer itself, still answer with the RST body, the security and noindex
// headers, and one `http` log entry.

const publicUrl = 'https://rosetta.example.org';

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function server(): TestServer {
  current = createTestServer({ publicUrl });
  return current;
}

async function listening(): Promise<{ app: TestServer; address: string }> {
  const app = server();
  app.server.post('/test/echo', (request) => ({ got: request.body }));
  app.server.get('/test/slow', async () => {
    await sleep(400);
    return { ok: true };
  });
  const address = await app.server.listen({ host: '127.0.0.1', port: 0 });
  return { app, address };
}

function expectProtected(headers: Map<string, string> | Record<string, unknown>): void {
  const get = (name: string): unknown =>
    headers instanceof Map ? headers.get(name) : headers[name];
  expect(String(get('content-security-policy'))).toContain("default-src 'self'");
  expect(String(get('content-security-policy'))).toContain("frame-ancestors 'none'");
  expect(get('x-content-type-options')).toBe('nosniff');
  expect(get('referrer-policy')).toBe('no-referrer');
  expect(get('x-frame-options')).toBe('DENY');
  expect(get('strict-transport-security')).toBe('max-age=31536000');
  expect(get('x-robots-tag')).toBe('noindex, nofollow');
}

function httpEntries(app: TestServer, statusCode: number): unknown[] {
  return app.logger.entries.filter(
    (entry) => entry.logger === 'http' && entry.data?.['statusCode'] === statusCode,
  );
}

/** The directives of a Content-Security-Policy header, in order. */
function directives(header: unknown): string[] {
  return String(header)
    .split(';')
    .map((directive) => directive.trim())
    .filter((directive) => directive !== '');
}

/** A header value as it is compared between two responses: the CSP directive by directive. */
function comparable(header: string, value: unknown): string | string[] {
  return header === 'content-security-policy' ? directives(value) : String(value);
}

describe('framework errors', () => {
  it('RF-007 a badly percent-encoded path answers 400 RST-2000 with the security headers', async () => {
    const app = server();

    const response = await app.server.inject({ method: 'GET', url: '/%c0%ae' });

    expect(response.statusCode).toBe(400);
    expectProtected(response.headers);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(response.body).not.toContain('%c0');
    expect(httpEntries(app, 400)).toHaveLength(1);
  });

  it('RF-1013 the fallback headers of a refused request equal the headers helmet sends', async () => {
    const app = server();

    const normal = await app.server.inject({ method: 'GET', url: '/healthz' });
    const refused = await app.server.inject({ method: 'GET', url: '/%c0%ae' });

    expect(normal.statusCode).toBe(200);
    expect(refused.statusCode).toBe(400);
    for (const [name, value] of Object.entries(fallbackSecurityHeaders(publicUrl))) {
      const header = name.toLowerCase();
      expect([header, refused.headers[header]]).toEqual([header, value]);
      expect([header, comparable(header, refused.headers[header])]).toEqual([
        header,
        comparable(header, normal.headers[header]),
      ]);
    }
  });
});

describe('client errors on the socket', () => {
  it('RF-007 a malformed request line answers 400 RST-2000 with the security headers', async () => {
    const { app, address } = await listening();

    const response = parseRawResponse(await sendRaw(address, 'NOT A REQUEST\r\n\r\n'));

    expect(response.status).toBe(400);
    expectProtected(response.headers);
    expect(JSON.parse(response.body)).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(httpEntries(app, 400)).toHaveLength(1);
  });

  it('RF-007 an oversized header answers 431 RST-2000 with the security headers', async () => {
    const { app, address } = await listening();
    const request = `GET / HTTP/1.1\r\nHost: localhost\r\nX-Big: ${'a'.repeat(20_000)}\r\n\r\n`;

    const response = parseRawResponse(await sendRaw(address, request));

    expect(response.status).toBe(431);
    expectProtected(response.headers);
    expect(JSON.parse(response.body)).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(httpEntries(app, 431)).toHaveLength(1);
  });
});

describe('requests Node core would answer by itself', () => {
  it('RF-1013 a request without a Host header reaches the routes with the security headers', async () => {
    const { app, address } = await listening();

    const response = parseRawResponse(await sendRaw(address, 'GET /healthz HTTP/1.1\r\n\r\n'));

    expect(response.status).toBe(200);
    expectProtected(response.headers);
    expect(JSON.parse(response.body)).toMatchObject({ status: 'ok' });
    expect(httpEntries(app, 200)).toHaveLength(1);
  });

  it('RF-007 an Expect header other than 100-continue answers 417 RST-2000 with the security headers', async () => {
    const { app, address } = await listening();
    const request = 'GET /healthz HTTP/1.1\r\nHost: localhost\r\nExpect: 200-ok\r\n\r\n';

    const response = parseRawResponse(await sendRaw(address, request));

    expect(response.status).toBe(417);
    expectProtected(response.headers);
    expect(JSON.parse(response.body)).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(httpEntries(app, 417)).toHaveLength(1);
    expect(app.logger.entries.filter((entry) => entry.logger === 'http')).toHaveLength(1);
  });

  it('RF-1013 Expect: 100-continue is answered and the request reaches the routes', async () => {
    const { app, address } = await listening();
    const request =
      'POST /test/echo HTTP/1.1\r\nHost: localhost\r\nExpect: 100-continue\r\n' +
      'Content-Type: application/json\r\nContent-Length: 9\r\n\r\n{"a":"b"}';

    const responses = parseRawResponses(await sendRaw(address, request));

    expect(responses.map((response) => response.status)).toEqual([100, 200]);
    expect(responses[1]?.body).toBe('{"got":{"a":"b"}}');
    expectProtected(responses[1]?.headers ?? new Map());
    expect(httpEntries(app, 200)).toHaveLength(1);
  });
});

describe('tunnelling requests', () => {
  it('RF-007 a CONNECT request answers 400 RST-2000 with the security headers', async () => {
    const { app, address } = await listening();
    const request = 'CONNECT example.org:443 HTTP/1.1\r\nHost: example.org:443\r\n\r\n';

    const response = parseRawResponse(await sendRaw(address, request));

    expect(response.status).toBe(400);
    expectProtected(response.headers);
    expect(JSON.parse(response.body)).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(httpEntries(app, 400)).toHaveLength(1);
  });
});

describe('requests while the server closes', () => {
  it('RF-007 a request on a busy keep-alive connection during close() is served by the normal chain', async () => {
    const { app, address } = await listening();
    const connection = await openRawConnection(address);

    connection.write('GET /test/slow HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await sleep(100);
    const closing = app.server.close();
    await sleep(50);
    connection.write('GET /no-such-page HTTP/1.1\r\nHost: localhost\r\n\r\n');
    const responses = parseRawResponses(await connection.settle());
    await closing;

    expect(responses.map((response) => response.status)).toEqual([200, 404]);
    expect(responses[1]?.headers.get('connection')).toBe('close');
    expectProtected(responses[1]?.headers ?? new Map());
    expect(JSON.parse(responses[1]?.body ?? '')).toMatchObject({ code: ERROR_CODES.notFound });
    expect(httpEntries(app, 404)).toHaveLength(1);
    expect(app.logger.entries.filter((entry) => entry.logger === 'http')).toHaveLength(2);
  });
});
