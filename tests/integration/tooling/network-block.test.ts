import { once } from 'node:events';
import { get as httpGet, createServer, type Server } from 'node:http';
import { get as httpsGet } from 'node:https';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// RNF-005, ADR-008: the unit and integration projects refuse every non-loopback connection
// (tests/support/block-network.ts, loaded through setupFiles in vitest.config.ts).
const BLOCKED = /RNF-005: outbound network is blocked in tests/;

/** The error a connection attempt ends with: thrown on connect or emitted on the socket or request. */
function failureOf(open: () => { once(event: 'error', cb: (error: Error) => void): unknown }) {
  return new Promise<Error>((resolve) => {
    try {
      open().once('error', resolve);
    } catch (error) {
      resolve(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

describe('RNF-005 outbound network block', () => {
  it('RNF-005 refuses a raw TCP connection to a public address', async () => {
    const error = await failureOf(() => netConnect({ host: '192.0.2.1', port: 80 }));
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain('192.0.2.1');
  });

  it('RNF-005 refuses a TLS connection to a public host name', async () => {
    const error = await failureOf(() => tlsConnect({ host: 'example.com', port: 443 }));
    expect(error.message).toMatch(BLOCKED);
  });

  it('RNF-005 refuses an http request to a public host name', async () => {
    const error = await failureOf(() => httpGet('http://example.com/'));
    expect(error.message).toMatch(BLOCKED);
  });

  it('RNF-005 refuses an https request to a public host name', async () => {
    const error = await failureOf(() => httpsGet('https://example.com/'));
    expect(error.message).toMatch(BLOCKED);
  });

  it('RNF-005 refuses fetch to a public host name', async () => {
    const error = await fetch('https://example.com/').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(String(error instanceof Error ? error.cause : error)).toMatch(BLOCKED);
  });
});

describe('RNF-005 loopback stays reachable', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((_request, response) => {
      response.end('loopback ok');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
  });

  afterAll(() => {
    server.close();
  });

  it('RNF-005 still lets fetch reach a loopback server', async () => {
    const response = await fetch(`http://127.0.0.1:${String(port)}/`);
    expect(await response.text()).toBe('loopback ok');
  });

  it('RNF-005 still lets a raw socket reach localhost', async () => {
    const socket = netConnect({ host: 'localhost', port });
    await once(socket, 'connect');
    expect(socket.remoteAddress).toBeDefined();
    socket.destroy();
  });
});
