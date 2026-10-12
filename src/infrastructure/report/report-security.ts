// RF-1013, DEC-112: the content security policy and referrer policy of the static report pages.

/** The policy of RF-1013 without `frame-ancestors`, which browsers ignore in a `meta` element. */
export const REPORT_CSP = '';

/** The `referrer` meta value of every report page. */
export const REPORT_REFERRER = '';
