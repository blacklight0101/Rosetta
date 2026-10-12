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

/** A fetch that strips unexpected headers and caps every answer at `maxBytes`. */
export function anthropicFetch(
  maxBytes: number,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const response = await fetch(input, { ...init, headers: allowedOnly(init?.headers) });
    return cappedResponse(response, maxBytes);
  };
}
