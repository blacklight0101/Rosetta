import type { FastifyInstance } from 'fastify';
import type { ListModels } from '../../application/use-cases/list-models.js';

// RF-405, DEC-156: the models a role can be set to.

export interface ModelServices {
  readonly listModels: Pick<ListModels, 'execute'>;
}

export function registerModelRoutes(server: FastifyInstance, services: ModelServices): void {
  server.get('/api/models/:provider', { config: { access: 'user' } }, async (_request, reply) =>
    reply.status(501).send(await services.listModels.execute('')),
  );
}
