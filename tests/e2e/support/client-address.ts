// P1-14: a private IPv4 address derived from a name, for the X-Forwarded-For header of a test.
// The test server trusts one proxy hop (serve.ts), so a request that carries this header is counted
// by the rate limits under this address and not under 127.0.0.1, which every test shares.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const BYTE = 256;

/** The same name always gives the same address; different names almost always differ. */
export function clientAddressFor(name: string): string {
  let hash = FNV_OFFSET;
  for (const character of name) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0;
  }
  const octets = [(hash >>> 16) % BYTE, (hash >>> 8) % BYTE, hash % BYTE];
  return `10.${octets.map(String).join('.')}`;
}
