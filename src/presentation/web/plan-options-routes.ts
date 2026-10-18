import type { FastifyInstance } from 'fastify';
import type { SuggestPlanOptions } from '../../application/use-cases/suggest-plan-options.js';

// RF-608, RF-609: the options of Plan setup (POST /api/projects/:id/plan-options); written in the
// next commit.

export interface PlanOptionsServices {
  readonly suggestPlanOptions: Pick<SuggestPlanOptions, 'execute'>;
}

export function registerPlanOptionsRoutes(
  server: FastifyInstance,
  services: PlanOptionsServices,
): void {
  server.post(
    '/api/projects/:id/plan-options',
    { config: { access: 'user' } },
    async (_request, reply) => {
      await Promise.resolve(services);
      return reply.status(200).send({});
    },
  );
}
