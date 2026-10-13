// RF-1013, DEC-112: the content security policy and referrer policy of the static report pages.
// They are the policy of the server (`src/presentation/web/security-headers.ts`) written into each
// page, because a published copy has no server to send headers.

/** The policy of RF-1013 without `frame-ancestors`, which browsers ignore in a `meta` element. */
export const REPORT_CSP =
  "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; base-uri 'none'; form-action 'self'";

/** The `referrer` meta value of every report page. */
export const REPORT_REFERRER = 'no-referrer';
