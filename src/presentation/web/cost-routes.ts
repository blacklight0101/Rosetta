import type { FastifyInstance } from 'fastify';
import type { GetAccountTotals } from '../../application/use-cases/get-account-totals.js';
import type { GetProjectCost } from '../../application/use-cases/get-project-cost.js';

// RF-428, RF-1010, RF-1106, RF-1105, DEC-49: the cost ledger as the web UI reads it.
// - GET /api/account/totals: the totals pill of every signed-in header.
// - GET /api/projects/:id/cost: the cost page of one of the user's projects.

export interface CostServices {
  readonly getProjectCost: GetProjectCost;
  readonly getAccountTotals: GetAccountTotals;
}

// RF-1010
export function registerCostRoutes(_server: FastifyInstance, _services: CostServices): void {
  // Registered by P1-36.
}
