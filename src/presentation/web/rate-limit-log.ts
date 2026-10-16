import type { FastifyRequest } from 'fastify';
import type { RecordRefusedRequest } from '../../application/use-cases/record-refused-request.js';
import { requestPath } from './route-access.js';

// RF-009, RF-1109: reaching a rate limit (or the in-flight bound of the password routes) refuses
// the request with 429; it writes a `request.refused` audit row and a security event RST-2005 like
// every refused request, under the same per-address limit (DEC-141). `@fastify/rate-limit` calls
// `onExceeded` on every request over the limit, so that limit is what bounds these rows. The
// entries name the route and the address, never a header, cookie or body, so they carry no secret.

/** Records the refusal; a failing write never fails the request, so the promise never rejects. */
export async function recordRateLimited(
  refusals: RecordRefusedRequest,
  request: FastifyRequest,
): Promise<void> {
  await Promise.allSettled([
    refusals.execute({
      actor: request.signedIn?.actor ?? null,
      reason: 'rate-limit',
      method: request.method,
      path: requestPath(request),
      ip: request.ip,
    }),
  ]);
}
