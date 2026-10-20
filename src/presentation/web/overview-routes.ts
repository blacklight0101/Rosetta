import type { FastifyInstance } from 'fastify';
import type { ReadOverview } from '../../application/use-cases/read-overview.js';
import type { ReadRunCoverage } from '../../application/use-cases/read-run-coverage.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-264, RF-1105: the overview of a run on its page.
// - GET /api/runs/:runId/overview answers `{ overview }`: the overview the run wrote (`overview.json`),
//   or `null` while the run has none. Another user's run id answers 404 like an unknown one.
// - GET /api/runs/:runId/coverage answers `{ areas }` (RF-230, RF-1005): every file of every area the run
//   has listed in `coverage.json`, with the lines read of each (none for a file not read); `areas` is
//   empty until the first task ends. The same 404 rule.

export interface OverviewServices {
  readonly readOverview: ReadOverview;
  readonly readCoverage: ReadRunCoverage;
}

// RF-264, RF-1105
export function registerOverviewRoutes(server: FastifyInstance, services: OverviewServices): void {
  registerCoverageRoute(server, services);
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

// RF-230, RF-1005, RF-1105
function registerCoverageRoute(server: FastifyInstance, services: OverviewServices): void {
  server.get<{ Params: { runId: string } }>(
    '/api/runs/:runId/coverage',
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.readCoverage.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      return reply.header('cache-control', 'no-store').send(outcome.value);
    },
  );
}
