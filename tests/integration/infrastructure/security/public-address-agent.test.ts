import { createServer, type AddressInfo, type Server } from 'node:net';
import { request } from 'node:https';
import type { LookupAddress } from 'node:dns';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  PublicAddressAgent,
  publicOnlyLookup,
} from '../../../../src/infrastructure/security/public-address-agent.js';
import { DnsPublicHostCheck } from '../../../../src/infrastructure/security/public-host-check.js';
import { FakeHostResolver } from '../../../support/fake-host-resolver.js';

// RF-1104, DEC-112, threat model TB5: the base-URL address check runs again on every connect
// through a guarded HTTP agent, so a name that resolved to a public address when the key was saved
// and resolves to an internal one later (DNS rebinding) is refused before any socket opens. A
// loopback TCP listener counts connection attempts; the fake resolver keeps every test offline.

interface Listener {
  readonly server: Server;
  readonly port: number;
  connections: number;
}

const listeners: Listener[] = [];

async function listen(): Promise<Listener> {
  const listener: { server: Server; port: number; connections: number } = {
    server: createServer((socket) => {
      listener.connections += 1;
      socket.destroy();
    }),
    port: 0,
    connections: 0,
  };
  await new Promise<void>((resolve) => listener.server.listen(0, '127.0.0.1', resolve));
  const address: AddressInfo | string | null = listener.server.address();
  listener.port = typeof address === 'object' && address !== null ? address.port : 0;
  listeners.push(listener);
  return listener;
}

function requestError(agent: PublicAddressAgent, host: string, port: number): Promise<unknown> {
  return new Promise((resolve) => {
    const outgoing = request({ host, port, path: '/v1/models', agent, timeout: 2_000 }, () => {
      resolve(new Error('the request was answered'));
    });
    outgoing.on('error', resolve);
    outgoing.end();
  });
}

function lookupOnce(
  lookup: ReturnType<typeof publicOnlyLookup>,
  host: string,
  options: { all?: boolean; family?: number },
): Promise<{ error: unknown; address: string | LookupAddress[] }> {
  return new Promise((resolve) => {
    lookup(host, options, (error, address) => {
      resolve({ error, address });
    });
  });
}

afterEach(async () => {
  await Promise.all(
    listeners.splice(0).map((listener) => new Promise((done) => listener.server.close(done))),
  );
});

describe('PublicAddressAgent', () => {
  it('RF-1104 refuses a name that turned internal after the save check (DNS rebinding)', async () => {
    const listener = await listen();
    const resolver = new FakeHostResolver().answer('localhost', ['93.184.215.14'], ['127.0.0.1']);
    const saved = await new DnsPublicHostCheck({ resolver: resolver.resolve }).isPublicHost(
      'localhost',
    );
    const agent = new PublicAddressAgent({ resolver: resolver.resolve });

    const error = await requestError(agent, 'localhost', listener.port);

    expect(saved).toBe(true);
    expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
    expect(resolver.lookups).toEqual(['localhost', 'localhost']);
    expect(listener.connections).toBe(0);
    agent.destroy();
  });

  it.each(['127.0.0.1', '::ffff:127.0.0.1'])(
    'RF-1104 refuses the internal IP literal %s without a lookup or a connection',
    async (host) => {
      const listener = await listen();
      const resolver = new FakeHostResolver();
      const agent = new PublicAddressAgent({ resolver: resolver.resolve });

      const error = await requestError(agent, host, listener.port);

      expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
      expect(resolver.lookups).toEqual([]);
      expect(listener.connections).toBe(0);
      agent.destroy();
    },
  );
});

describe('publicOnlyLookup', () => {
  const resolver = new FakeHostResolver().answer('llm.example.com', [
    '93.184.215.14',
    '2606:4700:4700::1111',
  ]);
  const lookup = publicOnlyLookup(resolver.resolve, 2_000);

  it('RF-1104 hands every public address to the socket when asked for all', async () => {
    const answer = await lookupOnce(lookup, 'llm.example.com', { all: true });

    expect(answer).toEqual({
      error: null,
      address: [
        { address: '93.184.215.14', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ],
    });
  });

  it('RF-1104 hands the first address of the asked family otherwise', async () => {
    expect(await lookupOnce(lookup, 'llm.example.com', {})).toMatchObject({
      address: '93.184.215.14',
    });
    expect(await lookupOnce(lookup, 'llm.example.com', { family: 6 })).toMatchObject({
      address: '2606:4700:4700::1111',
    });
  });

  it('RF-1104 refuses a name with no address of the asked family', async () => {
    const onlyV4 = new FakeHostResolver().answer('v4.example.com', ['93.184.215.14']);

    const answer = await lookupOnce(publicOnlyLookup(onlyV4.resolve, 2_000), 'v4.example.com', {
      family: 6,
    });

    expect(answer.error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
  });
});
