import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { PublicHostCheck } from '../../application/ports/public-host-check.js';
import { bareHost, isPublicAddress } from './public-address.js';

// RF-1104, DEC-112: the save-time check of an OpenAI-compatible base URL. The host is resolved
// through node:dns (`lookup`, the resolver sockets use, with every address) and accepted only when
// it resolves to at least one address and every one is public. An IP literal is checked without a
// lookup. A lookup that fails or takes longer than the time limit refuses the host (fail closed).
// Tests hand in a fake resolver, so no test resolves a real name.

export interface ResolvedAddress {
  readonly address: string;
  readonly family: number;
}

/** Resolves a host name to every address it has. */
export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/** The system resolver: getaddrinfo through node:dns, every address, in the order it gives. */
export const systemResolver: HostResolver = (hostname) =>
  lookup(hostname, { all: true, order: 'verbatim' });

/** How long a lookup may take before the host is refused. */
export const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000;

/** The public addresses of the host, or undefined when it has none or any that is not public. */
// RF-1104
export async function publicAddressesOf(
  hostname: string,
  resolver: HostResolver,
  timeoutMs: number,
): Promise<readonly ResolvedAddress[] | undefined> {
  const host = bareHost(hostname);
  const family = isIP(host);
  if (family !== 0) return isPublicAddress(host) ? [{ address: host, family }] : undefined;
  const addresses = await resolveWithin(resolver, host, timeoutMs);
  if (addresses === undefined || addresses.length === 0) return undefined;
  return addresses.every((entry) => isPublicAddress(entry.address)) ? addresses : undefined;
}

/** The resolver's answer, or undefined when it fails or does not answer in time. */
async function resolveWithin(
  resolver: HostResolver,
  host: string,
  timeoutMs: number,
): Promise<readonly ResolvedAddress[] | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, undefined);
  });
  try {
    return await Promise.race([resolver(host), late]);
  } catch {
    // A name that does not resolve is not a public address; the caller refuses it (RST-2304).
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export interface DnsPublicHostCheckOptions {
  readonly resolver?: HostResolver;
  readonly timeoutMs?: number;
}

export class DnsPublicHostCheck implements PublicHostCheck {
  private readonly resolver: HostResolver;
  private readonly timeoutMs: number;

  constructor(options: DnsPublicHostCheckOptions = {}) {
    this.resolver = options.resolver ?? systemResolver;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS;
  }

  async isPublicHost(hostname: string): Promise<boolean> {
    return (await publicAddressesOf(hostname, this.resolver, this.timeoutMs)) !== undefined;
  }
}
