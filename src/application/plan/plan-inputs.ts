import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { supportedCards, type SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { Run } from '../../domain/runs/run.js';
import type { AnswersFile, RecordedQuestion } from '../ports/answers-file.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import type { Project } from '../projects/project.js';
import { scopeOf } from '../runs/run-scope.js';
import { planSourceRun } from './plan-source.js';

// RF-604, RF-614, DEC-80: what a plan run is written from: the project, its saved planning brief, the
// understand run the plan was started from (the newest one that ended `Completed` when none was
// named), that run's cards and the open questions it found with their answers. A project without a
// saved brief (RST-1801), without such a run, or whose run has no supported claim (RST-1802) stops the
// run before any model call; a named run that is not the user's is not found (RF-1105).

export interface PlanInputDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly briefs: PlanningBriefStore;
  readonly cards: RunCards;
  readonly answers: Pick<AnswersFile, 'questionsOf'>;
}

export interface PlanInputs {
  readonly project: Project;
  readonly brief: PlanningBrief;
  readonly sourceRun: Run;
  /** Every card of the source run, with every claim. */
  readonly cards: readonly SourceCard[];
  /** The source run's open questions, answered or not, in file order. */
  readonly questions: readonly RecordedQuestion[];
}

export interface PlanInputProblem {
  readonly code: ErrorCode;
  readonly message: string;
}

const problems = {
  project: { code: ERROR_CODES.notFound, message: 'The project of the plan run is gone.' },
  brief: {
    code: ERROR_CODES.planBriefMissing,
    message: 'The project has no saved planning brief.',
  },
  run: {
    code: ERROR_CODES.planSourceMissing,
    message: 'There is no understand run that ended Completed to plan from.',
  },
  missing: { code: ERROR_CODES.notFound, message: 'The source run of the plan run is gone.' },
  claims: {
    code: ERROR_CODES.planSourceMissing,
    message: 'The source understand run has no supported claim.',
  },
} as const;

// RF-604, RF-614
export async function planInputs(
  deps: PlanInputDependencies,
  run: Pick<Run, 'userId' | 'projectId'>,
  sourceRunId?: string,
): Promise<Result<PlanInputs, PlanInputProblem>> {
  const project = await deps.projects.find(run.userId, run.projectId);
  if (project === undefined) return err(problems.project);
  const ref = { userId: run.userId, projectId: run.projectId };
  const brief = await deps.briefs.read(ref);
  if (brief === undefined) return err(problems.brief);
  const found = await planSourceRun(deps.runs, run, sourceRunId);
  if (!found.ok) {
    return err(found.error === ERROR_CODES.notFound ? problems.missing : problems.run);
  }
  const sourceRun = found.value;
  const cards = await deps.cards.cardsOf(scopeOf(sourceRun));
  if (supportedCards(cards).length === 0) return err(problems.claims);
  const questions = await deps.answers.questionsOf(ref, sourceRun.runKey);
  return ok({ project, brief, sourceRun, cards, questions });
}
