import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-007, RF-1013, RF-1201: requests that Fastify or the Node parser refuse before routing still
// answer with the RST body and the security and noindex headers.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function server(): TestServer {
  current = createTestServer({ publicUrl: 'https://rosetta.example.org' });
  return current;
}

/** Header names (lower case) and values of a raw HTTP response. */
function parse(raw: string): { status: number; headers: Map<string, string>; body: string } {
  const [head = '', body = ''] = raw.split('\r\n\r\n');
  const [statusLine = '', ...lines] = head.split('\r\n');
  const headers = new Map(
    lines.map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()] as const;
    }),
  );
  return { status: Number(statusLine.split(' ')[1]), headers, body };
}

/** Sends raw bytes to the server on a loopback socket and returns everything it answers. */
async function sendRaw(address: string, payload: string): Promise<string> {
  const { hostname, port } = new URL(address);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = connect({ host: hostname, port: Number(port) }, () => {
      socket.end(payload);
    });
    socket.setTimeout(5000, () => socket.destroy(new Error('no answer within 5 s')));
    socket.on('data', (chunk: Buffer) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
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

describe('framework errors', () => {
  it('RF-007 a badly percent-encoded path answers 400 RST-2000 with the security headers', async () => {
    const { server: app, logger } = server();

    const response = await app.inject({ method: 'GET', url: '/%c0%ae' });

    expect(response.statusCode).toBe(400);
    expectProtected(response.headers);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(response.body).not.toContain('%c0');
    const logged = logger.entries.filter(
      (entry) => entry.logger === 'http' && entry.data?.['statusCode'] === 400,
    );
    expect(logged).toHaveLength(1);
  });
});

describe('client errors on the socket', () => {
  it('RF-007 a malformed request line answers 400 RST-2000 with the security headers', async () => {
    const { server: app } = server();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });

    const response = parse(await sendRaw(address, 'NOT A REQUEST\r\n\r\n'));

    expect(response.status).toBe(400);
    expectProtected(response.headers);
    expect(JSON.parse(response.body)).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RF-007 an oversized header answers 431 RST-2000 with the security headers', async () => {
    const { server: app } = server();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const request = `GET / HTTP/1.1\r\nHost: localhost\r\nX-Big: ${'a'.repeat(20_000)}\r\n\r\n`;

    const response = parse(await sendRaw(address, request));

    expect(response.status).toBe(431);
    expectProtected(response.headers);
    expect(JSON.parse(response.body)).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });
});
