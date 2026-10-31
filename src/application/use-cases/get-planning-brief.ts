import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import { isBriefOutOfDate } from '../../domain/planning/brief-freshness.js';
import { buildBrief } from '../../domain/planning/planning-brief.js';
import type { PlanningBriefState } from '../planning/planning-brief-state.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-605, DEC-80, RF-1105: Get planning brief gives Plan setup the project's saved brief, or the
// defaults for every question while none is saved, and says whether the brief is out of date
// (saved after the newest finished package began). Another user's project id and an unknown id give
// the same answer.

export interface GetPlanningBriefDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly briefs: PlanningBriefStore;
  readonly catalogue: Catalogue;
}

export class GetPlanningBrief {
  private readonly deps: GetPlanningBriefDependencies;

  constructor(deps: GetPlanningBriefDependencies) {
    this.deps = deps;
  }

  // RF-605, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<PlanningBriefState, typeof ERROR_CODES.notFound>> {
    const { projects, runs, briefs, catalogue } = this.deps;
    const { userId } = request.actor;
    if ((await projects.find(userId, request.projectId)) === undefined) {
      return err(ERROR_CODES.notFound);
    }
    const saved = await briefs.read({ userId, projectId: request.projectId });
    if (saved === undefined) {
      return ok({ brief: buildBrief({}, catalogue), saved: false, outOfDate: false });
    }
    const projectRuns = await runs.list(userId, request.projectId);
    return ok({
      brief: saved,
      saved: true,
      outOfDate: isBriefOutOfDate(saved.savedAt, projectRuns),
    });
  }
}
