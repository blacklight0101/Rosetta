import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { FieldProblem } from '../../domain/errors/field-problems.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import { briefProblems } from '../../domain/planning/brief-problems.js';
import { isBriefOutOfDate, sameBrief } from '../../domain/planning/brief-freshness.js';
import {
  buildBrief,
  type BriefAnswers,
  type PlanningBrief,
} from '../../domain/planning/planning-brief.js';
import type { PlanningBriefState } from '../planning/planning-brief-state.js';
import type { Clock } from '../ports/clock.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-605, DEC-80, RF-1105: Save planning brief stores the answers of Plan setup for the project.
// A question left out takes its default and is listed in `defaulted`; an unknown principle or a
// repeated layer is refused and nothing is written. Saving the same answers again keeps the file as
// it is, so the brief does not turn "out of date" without a change. The owner check comes first.

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

  // RF-605, RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
    readonly answers: BriefAnswers;
  }): Promise<Result<PlanningBriefState, SaveBriefRefusal>> {
    const { projects, runs, briefs, catalogue, clock } = this.deps;
    const { userId } = request.actor;
    if ((await projects.find(userId, request.projectId)) === undefined) {
      return err({ code: ERROR_CODES.notFound });
    }
    const problems = briefProblems(request.answers, catalogue);
    if (problems.length > 0) {
      const fields = problems.map(({ field, reason }) => ({
        field,
        reason,
        code: ERROR_CODES.requestInvalid,
      }));
      return err({ code: ERROR_CODES.requestInvalid, problems: fields });
    }
    const project = { userId, projectId: request.projectId };
    const unsaved = buildBrief(request.answers, catalogue);
    const stored = await briefs.read(project);
    const brief: PlanningBrief =
      stored !== undefined && sameBrief(stored, unsaved)
        ? stored
        : { ...unsaved, savedAt: clock.now().toISOString() };
    if (brief !== stored) await briefs.write(project, brief);
    const projectRuns = await runs.list(userId, request.projectId);
    return ok({ brief, saved: true, outOfDate: isBriefOutOfDate(brief.savedAt, projectRuns) });
  }
}
