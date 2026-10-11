// RF-402, ADR-013: a provider answer is untrusted and is read with a size limit, so a broken or
// hostile endpoint cannot make Rosetta buffer an unbounded body.

/** The default limit on one provider answer: 8 MiB, far above any chat completion. */
export const defaultMaxResponseBytes = 8 * 1024 * 1024;

/** Reading a body stopped because it passed the size limit. */
export class ResponseTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`The provider answer is larger than ${String(maxBytes)} bytes.`);
    this.name = 'ResponseTooLargeError';
    this.maxBytes = maxBytes;
  }
}

/** The same response whose body errors with ResponseTooLargeError past `maxBytes`. */
export function cappedResponse(response: Response, maxBytes: number): Response {
  if (response.body === null) return response;
  let seen = 0;
  const limit = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > maxBytes) controller.error(new ResponseTooLargeError(maxBytes));
      else controller.enqueue(chunk);
    },
  });
  return new Response(response.body.pipeThrough(limit), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
