import { lookup as dnsLookup } from 'node:dns';
import { Socket } from 'node:net';
import { isAllowedHost } from './network-policy.js';

// Vitest setup file for the unit and integration projects (RNF-005, ADR-008, conventions
// section 7). Every socket in this process goes through net.Socket#connect, which covers net,
// tls, http, https and fetch (undici), so one guard there refuses them all with a clear error.
// The guard throws, so callers see the error where they connect or on their request or
// rejected promise. Unix-domain sockets are local and stay allowed. A loopback host name is also
// checked after resolution, so a custom `lookup` cannot send it elsewhere. Out of scope: child
// processes, worker_threads Workers (each has its own module graph and is not given this guard)
// and DNS lookups themselves, which the card does not list (only net, tls, http, https, fetch).

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

function isNumberLike(value: string): boolean {
  return Number(value) >= 0;
}

function optionsHost(options: object): string | undefined {
  if ('path' in options && typeof options.path === 'string') return undefined;
  return 'host' in options && typeof options.host === 'string' ? options.host : 'localhost';
}

/** The host a connect call targets, or undefined for a local (unix-domain) socket. */
function targetHost(args: unknown[]): string | undefined {
  // Socket#connect receives its arguments already normalised as [[options, callback]].
  const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  if (typeof first === 'object' && first !== null) return optionsHost(first);
  // Like Node's isPipeName: a string that is not number-like is a path; '80' is a port.
  if (typeof first === 'string' && !isNumberLike(first)) return undefined;
  return typeof second === 'string' ? second : 'localhost';
}

type LookupCallback = (error: Error | null, address?: unknown, family?: number) => void;
interface LookupOptions {
  lookup?: (host: string, options: object, callback: LookupCallback) => void;
}

function resolvedAddresses(address: unknown): string[] {
  const list: unknown[] = Array.isArray(address) ? address : [{ address }];
  return list.map((entry) =>
    typeof entry === 'object' && entry !== null && 'address' in entry ? String(entry.address) : '',
  );
}

/** Wraps the `lookup` option so every address a loopback name resolves to is checked too. */
function guardedLookup(options: LookupOptions): LookupOptions['lookup'] {
  const resolve = options.lookup ?? dnsLookup;
  return (host, lookupOptions, callback) => {
    resolve(host, lookupOptions, (error, address, family) => {
      const blocked = error
        ? undefined
        : resolvedAddresses(address).find((a) => !isAllowedHost(a, databaseUrl));
      callback(blocked === undefined ? error : new NetworkBlockedError(blocked), address, family);
    });
  };
}

/** Options for a connect whose loopback host name must also resolve to an allowed address. */
function withGuardedLookup(args: unknown[]): unknown[] {
  const inner = Array.isArray(args[0]) ? (args[0] as unknown[]) : undefined;
  const options = inner?.[0];
  if (inner === undefined || typeof options !== 'object' || options === null) return args;
  const host = optionsHost(options);
  if (host === undefined || !isAllowedHost(host, undefined)) return args; // the configured database host is trusted by name
  // Node marks the normalised array with a symbol, so replace the options in place.
  inner[0] = { ...options, lookup: guardedLookup(options) };
  return args;
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- kept to be applied with the caller's `this` in the guard below.
const originalConnect = Socket.prototype.connect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Socket#connect is overloaded; the guard only inspects the first two arguments and forwards all of them.
Socket.prototype.connect = function guardedConnect(this: Socket, ...args: any[]): Socket {
  const host = targetHost(args);
  if (host !== undefined && !isAllowedHost(host, databaseUrl)) {
    throw new NetworkBlockedError(host);
  }
  return Reflect.apply(originalConnect, this, withGuardedLookup(args)) as Socket;
};
