import type {
  HostResolver,
  ResolvedAddress,
} from '../../src/infrastructure/security/public-host-check.js';

// RF-1104, RNF-005: a DNS stand-in for the base-URL checks. Tests never resolve a real name: each
// host name answers the addresses a test gave it (in order, one answer per lookup, the last one
// repeated), so a test can make a name change its address between the save and the connect (DNS
// rebinding). An unknown name fails like a lookup that found nothing.

function familyOf(address: string): number {
  return address.includes(':') ? 6 : 4;
}

export class FakeHostResolver {
  readonly lookups: string[] = [];
  private readonly answers = new Map<string, (readonly string[])[]>();

  /** The addresses `host` resolves to at its next lookups, one list per lookup. */
  answer(host: string, ...lookups: (readonly string[])[]): this {
    this.answers.set(host.toLowerCase(), [...lookups]);
    return this;
  }

  readonly resolve: HostResolver = (host) => {
    this.lookups.push(host);
    const queue = this.answers.get(host.toLowerCase());
    if (queue === undefined || queue.length === 0) {
      return Promise.reject(new Error(`getaddrinfo ENOTFOUND ${host}`));
    }
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const addresses: ResolvedAddress[] = (next ?? []).map((address) => ({
      address,
      family: familyOf(address),
    }));
    return Promise.resolve(addresses);
  };
}
