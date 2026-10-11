import { once } from 'node:events';
import { get as httpGet, createServer, type Server } from 'node:http';
import { get as httpsGet } from 'node:https';
import { connect as netConnect, type AddressInfo } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// RNF-005, ADR-008: the unit and integration projects refuse every non-loopback connection
// (tests/support/block-network.ts, loaded through setupFiles in vitest.config.ts).
const BLOCKED = /RNF-005: outbound network is blocked in tests/;

function failureOf(open: () => { once(event: 'error', cb: (error: Error) => void): unknown }) {
  return new Promise<Error>((resolve) => {
    open().once('error', resolve);
  });
}

describe('RNF-005 outbound network block', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((_request, response) => {
      response.end('loopback ok');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => {
    server.close();
  });

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
    await expect(fetch('https://example.com/')).rejects.toThrow(BLOCKED);
  });

  it('RNF-005 still lets fetch reach a loopback server', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(await response.text()).toBe('loopback ok');
  });

  it('RNF-005 still lets a raw socket reach localhost', async () => {
    const socket = netConnect({ host: 'localhost', port });
    await once(socket, 'connect');
    socket.destroy();
  });
});
