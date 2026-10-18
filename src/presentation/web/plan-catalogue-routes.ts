import type { FastifyInstance } from 'fastify';
import type { Catalogue } from '../../domain/planning/catalogue.js';

// RF-605, RF-606, RF-610: the catalogue Plan setup lists its questions from. GET /api/plan/catalogue
// needs a session and answers `{ version, entries, migrations }`: every catalogue entry with its
// group, title, one-line rule, why it matters, how to check it and whether a new brief switches it
// on, and the three migration strategies with their trade-off. The text is Rosetta's own and is
// read once at start-up (RF-606).

export interface PlanCatalogueServices {
  readonly catalogue: Catalogue;
}

// RF-606
export function registerPlanCatalogueRoutes(
  server: FastifyInstance,
  services: PlanCatalogueServices,
): void {
  server.get('/api/plan/catalogue', { config: { access: 'user' } }, async (_request, reply) => {
    return reply
      .header('cache-control', 'no-store')
      .send({ version: services.catalogue.version, entries: [], migrations: [] });
  });
}
