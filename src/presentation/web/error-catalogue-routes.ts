import type { FastifyInstance } from 'fastify';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { describeError } from '../../domain/errors/descriptions.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-007, RF-1108, RNF-008: GET /api/errors/:code gives the catalogue's plain message and next
// step for one code, so a page that only knows a code (the live run page, for a run that ended
// with an error) says what it means in the words of every other error of the application. The
// catalogue is not secret, but the route needs a session like every route that is not public. A
// string that is not a code of the catalogue answers 404.

function known(code: string): ErrorCode | undefined {
  return Object.values(ERROR_CODES).find((candidate) => candidate === code);
}

// RF-007
export function registerErrorCatalogueRoutes(server: FastifyInstance): void {
  server.get<{ Params: { code: string } }>(
    '/api/errors/:code',
    { config: { access: 'user' } },
    async (request, reply) => {
      const code = known(request.params.code);
      if (code === undefined) throw new RosettaError(ERROR_CODES.notFound);
      return reply.status(200).send({ code, ...describeError(code) });
    },
  );
}
