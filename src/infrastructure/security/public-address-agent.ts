import type { LookupAddress } from 'node:dns';
import { Agent, type AgentOptions, type RequestOptions } from 'node:https';
import { isIP, Socket, type LookupFunction } from 'node:net';
import type { Duplex } from 'node:stream';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { bareHost, isPublicAddress } from './public-address.js';
import {
  DEFAULT_LOOKUP_TIMEOUT_MS,
  publicAddressesOf,
  systemResolver,
  type HostResolver,
  type ResolvedAddress,
} from './public-host-check.js';

// RF-1104, DEC-112, threat model TB5 (DNS rebinding): the HTTPS agent for a user's OpenAI-compatible
// base URL. Every connection resolves the host again through `publicOnlyLookup`, which hands the
// socket only addresses that are all public, so a name that pointed to a public address when the
// key was saved and points inside later is refused before a socket opens. Node skips the lookup for
// an IP literal, so `createConnection` checks a literal itself and answers a socket that fails.

function refused(hostname: string): RosettaError {
  return new RosettaError(
    ERROR_CODES.baseUrlRejected,
    `The address of ${hostname} is not public, so no connection was made.`,
  );
}

function familyOf(option: unknown): number {
  if (option === 4 || option === 'IPv4') return 4;
  if (option === 6 || option === 'IPv6') return 6;
  return 0;
}

function ofFamily(addresses: readonly ResolvedAddress[], family: number): LookupAddress[] {
  return addresses
    .filter((entry) => family === 0 || entry.family === family)
    .map((entry) => ({ address: entry.address, family: entry.family }));
}

/** A socket lookup that answers only public addresses and refuses the host otherwise. */
// RF-1104
export function publicOnlyLookup(resolver: HostResolver, timeoutMs: number): LookupFunction {
  return (hostname, options, callback) => {
    void publicAddressesOf(hostname, resolver, timeoutMs).then((addresses) => {
      const usable = ofFamily(addresses ?? [], familyOf(options.family));
      const [first] = usable;
      if (first === undefined) callback(refused(hostname), options.all === true ? [] : '');
      else if (options.all === true) callback(null, usable);
      else callback(null, first.address, first.family);
    });
  };
}

export interface PublicAddressAgentOptions {
  readonly resolver?: HostResolver;
  readonly timeoutMs?: number;
  /** Keep-alive and socket limits of the underlying agent. */
  readonly agent?: AgentOptions;
}

export class PublicAddressAgent extends Agent {
  private readonly guardedLookup: LookupFunction;

  constructor(options: PublicAddressAgentOptions = {}) {
    const lookup = publicOnlyLookup(
      options.resolver ?? systemResolver,
      options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS,
    );
    super({ ...options.agent, lookup });
    this.guardedLookup = lookup;
  }

  override createConnection(
    options: RequestOptions,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    const host = bareHost(options.host ?? options.hostname ?? '');
    if (isIP(host) !== 0 && !isPublicAddress(host)) {
      const socket = new Socket();
      process.nextTick(() => socket.destroy(refused(host)));
      return socket;
    }
    // The guarded lookup wins over any lookup a request passes in.
    return super.createConnection({ ...options, lookup: this.guardedLookup }, callback);
  }
}
