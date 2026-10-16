/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-meaningless-void-operator -- placeholder of the TDD red step, replaced by the next commit */
import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
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

  execute(_request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<PlanningBriefState, typeof ERROR_CODES.notFound>> {
    void this.deps;
    return Promise.resolve(err(ERROR_CODES.notFound));
  }
}
