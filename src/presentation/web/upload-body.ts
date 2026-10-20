import type { IncomingMessage } from 'node:http';

// RF-128, RF-129, RF-150: reading the raw body of an upload request. The body is a stream that the
// store reads under its own limit and time bound; it is never held in memory by the route.

const DIGITS = /^\d{1,15}$/u;

/** The `Content-Length` the client declared; undefined when it sent none or sent nonsense. */
export function declaredBytesOf(header: string | undefined): number | undefined {
  return header !== undefined && DIGITS.test(header) ? Number(header) : undefined;
}

/** The name header when it is there once; a repeated header is no name at all. */
export function fileNameOf(header: string | string[] | undefined): string | undefined {
  return typeof header === 'string' ? header : undefined;
}

/**
 * The body as chunks. Leaving early (the limit, a bad file) must not destroy the request, which would
 * destroy the connection before the refusal is sent; the route throws the rest away after the answer instead.
 */
export async function* chunksOf(raw: IncomingMessage): AsyncGenerator<Uint8Array> {
  for await (const chunk of raw.iterator({ destroyOnReturn: false })) {
    if (typeof chunk === 'string') yield Buffer.from(chunk);
    else if (chunk instanceof Uint8Array) yield chunk;
  }
}

/** How long the rest of a refused body is read and thrown away before the connection is cut. */
const DISCARD_MS = 10_000;

export function discard(raw: IncomingMessage): void {
  raw.resume();
  const timer = setTimeout(() => {
    raw.destroy();
  }, DISCARD_MS);
  timer.unref();
  raw.once('close', () => {
    clearTimeout(timer);
  });
}
