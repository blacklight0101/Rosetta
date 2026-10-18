import type { FastifyInstance } from 'fastify';
import type { Catalogue, CatalogueEntry } from '../../domain/planning/catalogue.js';
import { migrationStrategyInfo } from '../../domain/planning/migration-strategy.js';
import { migrationStrategies } from '../../domain/planning/planning-brief.js';

// RF-605, RF-606, RF-610: the catalogue Plan setup lists its questions from. GET /api/plan/catalogue
// needs a session and answers `{ version, entries, migrations }`: every catalogue entry with its
// group, title, one-line rule, why it matters, how to check it and whether a new brief switches it
// on, and the three migration strategies, the default first, with their trade-off. The text is
// Rosetta's own and is read once at start-up (RF-606).

export interface PlanCatalogueServices {
  readonly catalogue: Catalogue;
}

function entryView(entry: CatalogueEntry): Record<string, unknown> {
  const { id, group, title, rule, why, check, defaultOn } = entry;
  return { id, group, title, rule, why, check, defaultOn };
}

function migrationViews(): Record<string, unknown>[] {
  return migrationStrategies.map((id) => {
    const { title, tradeOff } = migrationStrategyInfo[id];
    return { id, title, tradeOff };
  });
}

// RF-606
export function registerPlanCatalogueRoutes(
  server: FastifyInstance,
  services: PlanCatalogueServices,
): void {
  const { catalogue } = services;
  server.get('/api/plan/catalogue', { config: { access: 'user' } }, async (_request, reply) => {
    return reply.header('cache-control', 'no-store').send({
      version: catalogue.version,
      entries: catalogue.entries.map(entryView),
      migrations: migrationViews(),
    });
  });
}
