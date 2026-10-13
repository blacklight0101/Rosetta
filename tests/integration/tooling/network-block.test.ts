import { once } from 'node:events';
import { get as httpGet, createServer, type Server } from 'node:http';
import { connect as http2Connect } from 'node:http2';
import { get as httpsGet } from 'node:https';
import type { LookupFunction } from 'node:net';
import { Socket, connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// RNF-005, ADR-008: the unit and integration projects refuse every non-loopback connection
// (tests/support/block-network.ts, loaded through setupFiles in vitest.config.ts).
const BLOCKED = /RNF-005: outbound network is blocked in tests/;
const PUBLIC = '192.0.2.1';

/** A custom lookup that sends every name to a public (TEST-NET) address. */
const publicLookup: LookupFunction = (_host, options, callback) => {
  if (options.all === true) callback(null, [{ address: PUBLIC, family: 4 }]);
  else callback(null, PUBLIC, 4);
};

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

  it('RNF-005 refuses a numeric-string port to a public address', async () => {
    const socket = new Socket();
    // Node accepts a numeric-string port at run time; the typings only allow a number.
    const error = await failureOf(() => {
      Reflect.apply(socket.connect.bind(socket), undefined, ['80', PUBLIC]);
      return socket;
    });
    socket.destroy();
    expect(error.message).toMatch(BLOCKED);
  });
});

describe('RNF-005 outbound network block with a custom lookup', () => {
  it('RNF-005 refuses a loopback name that a custom lookup resolves to a public address', async () => {
    const error = await failureOf(() =>
      netConnect({ host: 'localhost', port: 80, lookup: publicLookup }),
    );
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
  });

  it('RNF-005 refuses a TLS connection whose custom lookup resolves to a public address', async () => {
    const error = await failureOf(() =>
      tlsConnect({ host: 'localhost', port: 443, lookup: publicLookup }),
    );
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
  });

  it('RNF-005 refuses Socket#connect(options) whose custom lookup resolves to a public address', async () => {
    const socket = new Socket();
    const error = await failureOf(() =>
      socket.connect({ host: 'localhost', port: 80, lookup: publicLookup }),
    );
    socket.destroy();
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
  });

  it('RNF-005 refuses an https request whose custom lookup resolves to a public address', async () => {
    const error = await failureOf(() =>
      httpsGet({ host: 'localhost', port: 443, lookup: publicLookup }),
    );
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
  });

  it('RNF-005 refuses an http2 session whose custom lookup resolves to a public address', async () => {
    const error = await failureOf(() =>
      http2Connect('http://localhost:80', { lookup: publicLookup }),
    );
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
  });

  it('RNF-005 refuses an http2 session to a public host name', async () => {
    const error = await failureOf(() => http2Connect('https://example.com'));
    expect(error.message).toMatch(BLOCKED);
  });
});

describe('RNF-005 outbound network block with unusual connect arguments', () => {
  it('RNF-005 refuses a plain array that Node reads as the options object', async () => {
    // Node treats an untagged array as the options object itself, not as normalised arguments.
    const options = Object.assign([{ host: 'localhost', port: 80 }], { host: PUBLIC, port: 80 });
    const socket = new Socket();
    const error = await failureOf(() => socket.connect(options));
    socket.destroy();
    expect(error.message).toMatch(BLOCKED);
  });

  it('RNF-005 refuses an empty path, which Node ignores in favour of the host', async () => {
    const error = await failureOf(() => netConnect({ path: '', host: PUBLIC, port: 80 }));
    expect(error.message).toMatch(BLOCKED);
  });

  it('RNF-005 checks the host a connection uses, not one read earlier', async () => {
    // A host that reads as loopback a few times and then turns public must not slip past the
    // guard: the guard pins the host it checked, so Node resolves 'localhost' through the lookup.
    let reads = 0;
    const options = {
      port: 80,
      lookup: publicLookup,
      get host(): string {
        reads += 1;
        return reads <= 3 ? 'localhost' : PUBLIC;
      },
    };
    const error = await failureOf(() => netConnect(options));
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
  });

  it('RNF-005 refuses a Windows named pipe on a remote server', async () => {
    const error = await failureOf(() => netConnect({ path: String.raw`\\${PUBLIC}\pipe\rosetta` }));
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
  });

  it('RNF-005 refuses a local pipe path whose dot segments lead to a remote server', async () => {
    const path = [String.raw`\\.\pipe\..\UNC`, PUBLIC, 'pipe', 'rosetta'].join('\\');
    const error = await failureOf(() => netConnect({ path }));
    expect(error.message).toMatch(BLOCKED);
    expect(error.message).toContain(PUBLIC);
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
