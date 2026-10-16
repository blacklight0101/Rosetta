import type { Agent, ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import type { PublicAddressAgent } from '../../security/public-address-agent.js';
import { defaultMaxResponseBytes, ResponseTooLargeError } from '../capped-response.js';
import { allowedOnly } from './openai-fetch.js';

// RF-403, RF-1104, DEC-112, threat model TB5 (SSRF): the fetch the OpenAI-compatible adapter hands
// the `openai` package. Every request goes out through `node:https` on the agent it was given; the
// adapter builder gives it a PublicAddressAgent, whose connect resolves the host again through
// `publicOnlyLookup` and refuses an internal IP literal, so a base URL that was public when its key
// was saved and points inside later (DNS rebinding) never gets a socket. A URL of another scheme is
// refused before anything happens. `node:https` never follows a redirect: a 3xx answer reaches the
// SDK as an error status and its `Location` is never called. Only the headers Rosetta means to
// send are sent, and the answer is read with a size limit.

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** `https.request` (or, in tests over loopback, `http.request`). */
type Send = (
  url: URL,
  options: RequestOptions,
  answer: (incoming: IncomingMessage) => void,
) => ClientRequest;

export interface AgentFetchParts {
  /** The only scheme sent; any other URL is refused with RST-2304. */
  readonly protocol: 'http:' | 'https:';
  readonly send: Send;
  readonly agent: Agent;
  readonly maxBytes: number;
}

/** Statuses whose answer has no body. */
const bodyless = new Set([204, 205, 304]);

function refusedScheme(url: URL): RosettaError {
  return new RosettaError(
    ERROR_CODES.baseUrlRejected,
    `The base URL must use https; ${url.protocol} was refused, so no connection was made.`,
  );
}

function bodyOf(init: RequestInit | undefined): string | undefined {
  const body = init?.body;
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  throw new TypeError('The OpenAI-compatible transport sends only text bodies.');
}

function answerOf(incoming: IncomingMessage, bytes: Buffer): Response {
  const status = incoming.statusCode ?? 0;
  const headers = new Headers();
  const raw = incoming.rawHeaders;
  for (let index = 0; index + 1 < raw.length; index += 2) {
    headers.append(raw[index] ?? '', raw[index + 1] ?? '');
  }
  const body = bodyless.has(status) ? null : new Uint8Array(bytes);
  return new Response(body, { status, statusText: incoming.statusMessage ?? '', headers });
}

/** The whole answer, refused once it passes `maxBytes`. */
function responseOf(incoming: IncomingMessage, maxBytes: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let seen = 0;
    incoming.on('data', (chunk: unknown) => {
      if (!Buffer.isBuffer(chunk)) return;
      seen += chunk.byteLength;
      if (seen > maxBytes) incoming.destroy(new ResponseTooLargeError(maxBytes));
      else chunks.push(chunk);
    });
    incoming.on('error', reject);
    incoming.on('close', () => {
      if (!incoming.complete) reject(new Error('The answer was cut off before its end.'));
    });
    incoming.on('end', () => {
      try {
        resolve(answerOf(incoming, Buffer.concat(chunks)));
      } catch (error) {
        reject(new Error('The answer is not a valid HTTP response.', { cause: error }));
      }
    });
  });
}

/** A fetch over `parts.send` on `parts.agent` that never follows a redirect. */
// RF-403, RF-1104
export function agentFetch(parts: AgentFetchParts): FetchLike {
  return (input, init) =>
    new Promise((resolve, reject) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.protocol !== parts.protocol) {
        reject(refusedScheme(url));
        return;
      }
      const options: RequestOptions = {
        method: init?.method ?? 'GET',
        headers: Object.fromEntries(allowedOnly(init?.headers)),
        agent: parts.agent,
        signal: init?.signal ?? undefined,
      };
      const outgoing = parts.send(url, options, (incoming) => {
        responseOf(incoming, parts.maxBytes).then(resolve, reject);
      });
      outgoing.on('error', reject);
      outgoing.end(bodyOf(init));
    });
}

/** The transport of every OpenAI-compatible call: https only, on the public-address agent. */
// RF-1104
export function publicAddressFetch(
  agent: PublicAddressAgent,
  maxBytes: number = defaultMaxResponseBytes,
): FetchLike {
  return agentFetch({ protocol: 'https:', send: httpsRequest, agent, maxBytes });
}
