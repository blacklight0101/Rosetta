import { Socket } from 'node:net';
import { isAllowedHost } from './network-policy.js';

// Vitest setup file for the unit and integration projects (RNF-005, ADR-008, conventions
// section 7). Every socket in this process goes through net.Socket#connect, which covers net,
// tls, http, https and fetch (undici), so one guard there refuses them all with a clear error.
// The guard throws, so callers see the error where they connect or on their request or
// rejected promise. Unix-domain sockets are local and stay allowed. Child processes are not affected.

const databaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'];

class NetworkBlockedError extends Error {
  readonly code = 'ROSETTA_NETWORK_BLOCKED';

  constructor(host: string) {
    super(
      `RNF-005: outbound network is blocked in tests: refused a connection to ${host}. ` +
        'Use the fake provider with recordings (ADR-008) or a loopback server.',
    );
    this.name = 'NetworkBlockedError';
  }
}

/** The host a connect call targets, or undefined for a local (unix-domain) socket. */
function targetHost(args: unknown[]): string | undefined {
  // Socket#connect receives its arguments already normalised as [[options, callback]].
  const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  if (typeof first === 'object' && first !== null) {
    if ('path' in first && typeof first.path === 'string') return undefined;
    return 'host' in first && typeof first.host === 'string' ? first.host : 'localhost';
  }
  if (typeof first === 'string') return undefined;
  return typeof second === 'string' ? second : 'localhost';
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- kept to be applied with the caller's `this` in the guard below.
const originalConnect = Socket.prototype.connect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Socket#connect is overloaded; the guard only inspects the first two arguments and forwards all of them.
Socket.prototype.connect = function guardedConnect(this: Socket, ...args: any[]): Socket {
  const host = targetHost(args);
  if (host !== undefined && !isAllowedHost(host, databaseUrl)) {
    throw new NetworkBlockedError(host);
  }
  return Reflect.apply(originalConnect, this, args) as Socket;
};
