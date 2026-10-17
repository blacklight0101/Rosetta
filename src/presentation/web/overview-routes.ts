import type { FastifyInstance } from 'fastify';
import type { ReadOverview } from '../../application/use-cases/read-overview.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-264, RF-1105: the overview of a run on its page.
// - GET /api/runs/:runId/overview answers `{ overview }`: the overview the run wrote (`overview.json`),
//   or `null` while the run has none. Another user's run id answers 404 like an unknown one.

export interface OverviewServices {
  readonly readOverview: ReadOverview;
}

// RF-264, RF-1105
export function registerOverviewRoutes(server: FastifyInstance, services: OverviewServices): void {
  server.get<{ Params: { runId: string } }>(
    '/api/runs/:runId/overview',
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.readOverview.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      return reply.header('cache-control', 'no-store').send({ overview: outcome.value ?? null });
    },
  );
}
