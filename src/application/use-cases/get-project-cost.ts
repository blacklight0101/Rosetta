import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import {
  breakdownOf,
  providerTestsOf,
  type BreakdownLine,
  type CostBreakdown,
} from '../budget/cost-breakdown.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Project } from '../projects/project.js';

// RF-428, RF-1010, RF-1105: the cost page of one of the signed-in user's projects: its totals and
// the breakdown by run, stage, role, provider and model, summed from the ledger. Another user's id
// and an unknown id give the same answer, so the answer never says whether a project exists.

export interface ProjectCost {
  readonly project: Project;
  readonly breakdown: CostBreakdown;
  /**
   * The user's provider tests (RF-407): they belong to no project and no run, so they are listed
   * beside the breakdown and left out of the project totals; null when there are none.
   */
  readonly providerTests: BreakdownLine | null;
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
  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<ProjectCost, typeof ERROR_CODES.notFound>> {
    const { userId } = request.actor;
    const project = await this.deps.projects.find(userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const [groups, tests] = await Promise.all([
      this.deps.costs.projectGroups(userId, project.id),
      this.deps.costs.providerTestGroups(userId),
    ]);
    return ok({ project, breakdown: breakdownOf(groups), providerTests: providerTestsOf(tests) });
  }
}
