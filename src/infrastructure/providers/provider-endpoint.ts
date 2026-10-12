import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-143, DEC-118, ADR-006, P1-28 note: where a provider connects, parsed once. The egress guard
// judges `host` (is this machine, or does the run need the consent) and the adapter connects to
// `baseUrl`; both come from this one `new URL(...)`, so they cannot disagree. `http://localhost@evil.com`
// is the host `evil.com` with the user-info `localhost`: the guard sees `evil.com` and the adapter's
// URL no longer carries the user-info, a query or a fragment.

export interface ProviderEndpoint {
  /** The URL the adapter connects to: scheme, host, port and path; no credentials, query or fragment. */
  readonly baseUrl: string;
  /** What the egress guard judges: the URL's host name (an IPv6 literal keeps its brackets). */
  readonly host: string;
}

/** The endpoint of an http(s) URL; RST-1517 when the text is not one. */
// RF-143
export function endpointOf(
  text: string,
): Result<ProviderEndpoint, typeof ERROR_CODES.providerUnavailable> {
  if (!URL.canParse(text)) return err(ERROR_CODES.providerUnavailable);
  const url = new URL(text);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return err(ERROR_CODES.providerUnavailable);
  }
  if (url.hostname === '') return err(ERROR_CODES.providerUnavailable);
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/u, '');
  return ok({ baseUrl: `${url.origin}${path}`, host: url.hostname });
}
