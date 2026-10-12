import type { FastifyRequest } from 'fastify';
import type { Logger } from '../../application/ports/logger.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';

// RF-009: reaching a rate limit is a security event. The entry names the route and the address,
// never a header, cookie or body, so it carries no secret.

/** Writes the RST-2005 entry without delaying the 429; a failing log never fails the request. */
export function logRateLimited(logger: Logger, request: FastifyRequest): void {
  void Promise.allSettled([
    logger.securityEvent(ERROR_CODES.rateLimited, {
      message: `Rate limit reached: ${request.method} ${request.routeOptions.url ?? ''}`,
      data: { ip: request.ip },
    }),
  ]);
}
