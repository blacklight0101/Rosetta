import type { FastifyInstance } from 'fastify';
import type { GetStackOffer } from '../../application/use-cases/get-stack-offer.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';
import { sourceRunQuery } from './plan-source-routes.js';

// P7-29, RF-609, RF-645, DEC-203: GET /api/projects/:id/stack-offer answers `{ layers }`: for each of
// the seven stack layers the two proposals of the catalogue (the recommended one first), each with
// a one-line reason, and whether the layer may keep its legacy technology. It reads the catalogue and
// the scan only, so no code leaves the machine. It needs a session; another user's project answers
// 404; `?run=` names the understand run the page plans from.

export interface StackOfferServices {
  readonly getStackOffer: Pick<GetStackOffer, 'execute'>;
}

// RF-609
export function registerStackOfferRoutes(
  server: FastifyInstance,
  services: StackOfferServices,
): void {
  server.get<{ Params: { id: string }; Querystring: unknown }>(
    '/api/projects/:id/stack-offer',
    { config: { access: 'user' } },
    async (request, reply) => {
      const query = sourceRunQuery.safeParse(request.query);
      if (!query.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const { run } = query.data;
      const outcome = await services.getStackOffer.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        ...(run === undefined ? {} : { runId: run }),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      return reply.header('cache-control', 'no-store').send({ layers: outcome.value });
    },
  );
}
