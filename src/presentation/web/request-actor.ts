import type { FastifyRequest } from 'fastify';
import type { SignedInSession } from '../../application/use-cases/resolve-session.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-1009, RF-1105: the signed-in session of a request on a route that is not public. The access
// hook has already answered 401 without one, so reaching the error here is a programming fault.

export function signedInOf(request: FastifyRequest): SignedInSession {
  if (request.signedIn === null) throw new RosettaError(ERROR_CODES.notSignedIn);
  return request.signedIn;
}
