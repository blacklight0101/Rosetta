import type { PlanningBriefStore } from '../../src/application/ports/planning-brief-store.js';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import { GetPlanningBrief } from '../../src/application/use-cases/get-planning-brief.js';
import { SavePlanningBrief } from '../../src/application/use-cases/save-planning-brief.js';
import { loadCatalogue } from '../../src/infrastructure/prompts/catalogue-files.js';
import type { FixedClock } from './fixed-clock.js';

// RF-605, DEC-80: the planning brief use cases over the shipped catalogue and a brief file kept in
// memory (`answerStore` of observability-store.ts), for the unit, integration and access tests.

/** The catalogue shipped in `prompts/catalogue/`, read once. */
export const shippedCatalogue = await loadCatalogue('prompts');

export interface BriefServices {
  readonly getPlanningBrief: GetPlanningBrief;
  readonly savePlanningBrief: SavePlanningBrief;
}

export function briefServices(parts: {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly briefs: PlanningBriefStore;
  readonly clock: FixedClock;
}): BriefServices {
  const deps = { ...parts, catalogue: shippedCatalogue };
  return {
    getPlanningBrief: new GetPlanningBrief(deps),
    savePlanningBrief: new SavePlanningBrief(deps),
  };
}
