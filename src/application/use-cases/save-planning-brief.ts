/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-meaningless-void-operator -- placeholder of the TDD red step, replaced by the next commit */
import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { FieldProblem } from '../../domain/errors/field-problems.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { BriefAnswers } from '../../domain/planning/planning-brief.js';
import type { PlanningBriefState } from '../planning/planning-brief-state.js';
import type { Clock } from '../ports/clock.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';

export type SaveBriefRefusal =
  | { readonly code: typeof ERROR_CODES.notFound }
  | {
      readonly code: typeof ERROR_CODES.requestInvalid;
      readonly problems: readonly FieldProblem[];
    };

export interface SavePlanningBriefDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly briefs: PlanningBriefStore;
  readonly catalogue: Catalogue;
  readonly clock: Clock;
}

export class SavePlanningBrief {
  private readonly deps: SavePlanningBriefDependencies;

  constructor(deps: SavePlanningBriefDependencies) {
    this.deps = deps;
  }

  // Placeholder behaviour: the tests of the next commit fail on it, the implementation follows.
  execute(_request: {
    readonly actor: Actor;
    readonly projectId: string;
    readonly answers: BriefAnswers;
  }): Promise<Result<PlanningBriefState, SaveBriefRefusal>> {
    void this.deps;
    return Promise.resolve(err({ code: ERROR_CODES.notFound }));
  }
}
