import { lookup as dnsLookup } from 'node:dns';
import * as net from 'node:net';
import { Socket } from 'node:net';
import { isAllowedHost, isAllowedPipe } from './network-policy.js';

// Vitest setup file for the unit and integration projects (RNF-005, ADR-008, conventions
// section 7). Every socket in this process goes through net.Socket#connect, which covers net,
// tls, http, https, http2 and fetch (undici), so one guard there refuses them all with a clear
// error. The guard throws, so callers see the error where they connect or on their request or
// rejected promise.
//
// Every call shape goes through one path: the arguments are normalised by Node's own
// normaliser into [options, callback], the destination fields are read once and pinned on a
// copy of the options (so a getter cannot answer differently later), and a loopback host name
// gets a lookup that checks every address it resolves to. Local pipes stay allowed; a Windows
// pipe on another server does not. Out of scope: child processes, worker_threads Workers (each
// has its own module graph and is not given this guard), UDP (dgram) and DNS lookups themselves,
// which the card does not list (only net, tls, http, https, fetch).

const databaseUrl = process.env['ROSETTA_TEST_DATABASE_URL'];

class NetworkBlockedError extends Error {
  readonly code = 'ROSETTA_NETWORK_BLOCKED';

  constructor(target: string) {
    super(
      `RNF-005: outbound network is blocked in tests: refused a connection to ${target}. ` +
        'Use the fake provider with recordings (ADR-008) or a loopback server.',
    );
    this.name = 'NetworkBlockedError';
  }
}

/** Node's internal net._normalizeArgs, which tags its result so Socket#connect uses it as is. */
function nodeNormaliser(): (args: unknown[]) => unknown[] {
  const normalize: unknown = Reflect.get(net, '_normalizeArgs');
  if (typeof normalize !== 'function') {
    throw new Error('RNF-005: cannot install the network guard: net._normalizeArgs is missing');
  }
  return (args) => {
    const result: unknown = Reflect.apply(normalize, undefined, [args]);
    if (!Array.isArray(result)) throw new Error('RNF-005: net._normalizeArgs returned a non-array');
    const call: unknown[] = result;
    return call;
  };
}

const normalizeArgs = nodeNormaliser();
const [normalizedTag] = Object.getOwnPropertySymbols(normalizeArgs([]));

/** The [options, callback] array Socket#connect will use: the caller's if Node tagged it. */
function normalised(args: unknown[]): unknown[] {
  const [first] = args;
  const tagged =
    Array.isArray(first) &&
    normalizedTag !== undefined &&
    Boolean(Reflect.get(first, normalizedTag));
  return tagged ? first : normalizeArgs(args);
}

type LookupCallback = (error: unknown, address?: unknown, family?: unknown) => void;
type Lookup = (host: string, options: unknown, callback: LookupCallback) => void;

function field(entry: unknown, key: string): unknown {
  return typeof entry === 'object' && entry !== null ? Reflect.get(entry, key) : undefined;
}

/** The address string of a lookup result entry; anything else reads as '', which is refused. */
function addressOf(entry: unknown): string {
  const value = typeof entry === 'string' ? entry : field(entry, 'address');
  return typeof value === 'string' ? value : '';
}

/** The lookup result rebuilt from plain strings, so what was checked is what Node connects to. */
function pinnedResult(address: unknown): { addresses: string[]; result: unknown } {
  if (!Array.isArray(address)) {
    const single = addressOf(address);
    return { addresses: [single], result: single };
  }
  const entries = address.map((entry: unknown) => ({
    address: addressOf(entry),
    family: field(entry, 'family'),
  }));
  return { addresses: entries.map((entry) => entry.address), result: entries };
}

/** Wraps a lookup so every address a loopback name resolves to is checked too. */
function guardedLookup(resolve: unknown): Lookup {
  return (host, lookupOptions, callback) => {
    const check: LookupCallback = (error, address, family) => {
      if (error !== null && error !== undefined) {
        callback(error, address, family);
        return;
      }
      const { addresses, result } = pinnedResult(address);
      const blocked = addresses.find((a) => !isAllowedHost(a, databaseUrl));
      if (blocked === undefined) callback(null, result, family);
      else callback(new NetworkBlockedError(blocked));
    };
    Reflect.apply(typeof resolve === 'function' ? resolve : dnsLookup, undefined, [
      host,
      lookupOptions,
      check,
    ]);
  };
}

/**
 * A copy of the options, inheriting every other field from them, with the fields that choose
 * the destination pinned as plain values (so a getter on the caller's object is not read again).
 */
function pin(options: object, fields: Record<string, unknown>): object {
  const copy = {};
  Object.setPrototypeOf(copy, options);
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(copy, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

/** Options for a pipe connect (Node: a truthy `path`), refused when the pipe is on another server. */
function pipeOptions(options: object, path: unknown): object {
  if (typeof path === 'string' && !isAllowedPipe(path, databaseUrl)) {
    throw new NetworkBlockedError(path);
  }
  return pin(options, { path });
}

/** Options for a TCP connect, refused unless the host is allowed; a loopback name gets a checked lookup. */
function tcpOptions(options: object, path: unknown): object {
  const rawHost: unknown = Reflect.get(options, 'host');
  // Node uses `options.host || 'localhost'`; other falsy non-strings are refused below.
  const host = rawHost === undefined || rawHost === null || rawHost === '' ? 'localhost' : rawHost;
  if (typeof host !== 'string') throw new NetworkBlockedError(`a ${typeof host} host`);
  if (!isAllowedHost(host, databaseUrl)) throw new NetworkBlockedError(host);
  const lookup: unknown = Reflect.get(options, 'lookup');
  const checkResolved =
    isAllowedHost(host, undefined) &&
    (lookup === undefined || lookup === null || typeof lookup === 'function');
  // The configured database host is trusted by name, so its lookup is left as it is.
  return pin(options, { path, host, lookup: checkResolved ? guardedLookup(lookup) : lookup });
}

/** The options Socket#connect will use, checked and pinned; throws when the target is not allowed. */
function guardedOptions(options: unknown): unknown {
  if (typeof options !== 'object' || options === null) return options;
  const path: unknown = Reflect.get(options, 'path');
  return path ? pipeOptions(options, path) : tcpOptions(options, path);
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- kept to be applied with the caller's `this` in the guard below.
const originalConnect = Socket.prototype.connect;

Socket.prototype.connect = function guardedConnect(this: Socket, ...args: unknown[]): Socket {
  const call = normalised(args);
  // Node tags the normalised array with a symbol, so replace the options in place.
  call[0] = guardedOptions(call[0]);
  Reflect.apply(originalConnect, this, [call]);
  return this;
};
