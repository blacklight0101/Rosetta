import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { CostBreakdown } from '../budget/cost-breakdown.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Project } from '../projects/project.js';

// RF-428, RF-1010, RF-1105: the cost page of one of the signed-in user's projects: its totals and
// the breakdown by run, stage, role, provider and model, summed from the ledger. Another user's id
// and an unknown id give the same answer, so the answer never says whether a project exists.

export interface ProjectCost {
  readonly project: Project;
  readonly breakdown: CostBreakdown;
}

export interface GetProjectCostDependencies {
  readonly projects: ProjectRepository;
  readonly costs: CostTotals;
}

export class GetProjectCost {
  private readonly deps: GetProjectCostDependencies;

  constructor(deps: GetProjectCostDependencies) {
    this.deps = deps;
  }

  // RF-428
  execute(_request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<ProjectCost, typeof ERROR_CODES.notFound>> {
    void this.deps;
    return Promise.resolve(err(ERROR_CODES.notFound));
  }
}
