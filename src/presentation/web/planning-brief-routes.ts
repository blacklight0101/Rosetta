/* eslint-disable @typescript-eslint/no-unused-vars -- placeholder of the TDD red step, replaced by the next commit */
import type { FastifyInstance } from 'fastify';
import type { GetPlanningBrief } from '../../application/use-cases/get-planning-brief.js';
import type { SavePlanningBrief } from '../../application/use-cases/save-planning-brief.js';

export interface PlanningBriefServices {
  readonly getPlanningBrief: GetPlanningBrief;
  readonly savePlanningBrief: SavePlanningBrief;
}

// Placeholder behaviour: the tests of the next commit fail on it, the implementation follows.
export function registerPlanningBriefRoutes(
  _server: FastifyInstance,
  _services: PlanningBriefServices,
): void {
  // no routes yet
}
