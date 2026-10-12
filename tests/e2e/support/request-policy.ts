import { isAllowedHost } from '../../support/network-policy.js';

// RNF-005, ADR-008: which requests the browser of an end-to-end test may make. The host rule is the
// one the unit and integration guard uses (tests/support/network-policy.ts): loopback only.

const LOCAL_SCHEMES: ReadonlySet<string> = new Set(['data:', 'blob:', 'about:']);
const NETWORK_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** True when the browser may request the URL. */
// RNF-005
export function isAllowedRequestUrl(raw: string): boolean {
  if (!URL.canParse(raw)) return false;
  const url = new URL(raw);
  if (LOCAL_SCHEMES.has(url.protocol)) return true;
  return NETWORK_SCHEMES.has(url.protocol) && isAllowedHost(url.hostname, undefined);
}
