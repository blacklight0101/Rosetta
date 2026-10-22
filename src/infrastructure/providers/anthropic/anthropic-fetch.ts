import { cappedResponse } from '../capped-response.js';

// RF-404, RNF-003: the fetch the Anthropic client uses. It sends only the headers Rosetta means to
// send (the SDK would add any `ANTHROPIC_CUSTOM_HEADERS` from the environment) and reads every
// answer with a size limit.

const allowedHeaders = new Set([
  'accept',
  'anthropic-version',
  'content-length',
  'content-type',
  'user-agent',
  'x-api-key',
]);

function isAllowed(name: string): boolean {
  return allowedHeaders.has(name) || name.startsWith('x-stainless-');
}

function allowedOnly(headers: RequestInit['headers']): Headers {
  const kept = new Headers();
  for (const [name, value] of new Headers(headers)) {
    if (isAllowed(name)) kept.set(name, value);
  }
  return kept;
}

/** The shape of `fetch` the client uses. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * A fetch that strips unexpected headers and caps every answer at `maxBytes`; `base` is the global
 * `fetch`, and a test replays a recorded stream through it.
 */
export function anthropicFetch(maxBytes: number, base: FetchLike = fetch): FetchLike {
  return async (input, init) => {
    const response = await base(input, { ...init, headers: allowedOnly(init?.headers) });
    return cappedResponse(response, maxBytes);
  };
}
