import { cappedResponse } from '../capped-response.js';

// RF-402, RNF-003, ADR-013: the fetch the OpenAI client uses. It sends only the headers Rosetta
// means to send (the SDK would add any `OPENAI_CUSTOM_HEADERS` from the environment), never follows
// a redirect, so an answer cannot send the key and the prompt to another address, and reads every
// answer with a size limit.

const allowedHeaders = new Set([
  'accept',
  'authorization',
  'content-length',
  'content-type',
  'idempotency-key',
  'user-agent',
]);

function isAllowed(name: string): boolean {
  return allowedHeaders.has(name) || name.startsWith('x-stainless-');
}

/** The headers Rosetta means to send, and no other (the SDK would add `OPENAI_CUSTOM_HEADERS`). */
export function allowedOnly(headers: RequestInit['headers']): Headers {
  const kept = new Headers();
  for (const [name, value] of new Headers(headers)) {
    if (isAllowed(name)) kept.set(name, value);
  }
  return kept;
}

/** A fetch that strips unexpected headers, refuses redirects and caps every answer at `maxBytes`. */
export function openAiFetch(
  maxBytes: number,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const response = await fetch(input, {
      ...init,
      headers: allowedOnly(init?.headers),
      redirect: 'error',
    });
    return cappedResponse(response, maxBytes);
  };
}
