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

// RF-604, DEC-80: what a plan run is written from: the project, its saved planning brief, the
// newest understand run of the project that ended `Completed`, that run's cards and the open
// questions it found with their answers. A project without a saved brief (RST-1801), without such
// a run, or whose run has no supported claim (RST-1802) stops the run before any model call.

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
    message: 'The project has no understand run that ended Completed.',
  },
  claims: {
    code: ERROR_CODES.planSourceMissing,
    message: 'The newest completed understand run has no supported claim.',
  },
} as const;

/** RF-604: the newest understand run of the project that ended `Completed`. */
async function sourceRunOf(
  runs: RunIndex,
  run: Pick<Run, 'userId' | 'projectId'>,
): Promise<Run | undefined> {
  const listed = await runs.list(run.userId, run.projectId);
  return listed.find((each) => each.stage === 'understand' && each.endState === 'Completed');
}

// RF-604
export async function planInputs(
  deps: PlanInputDependencies,
  run: Pick<Run, 'userId' | 'projectId'>,
): Promise<Result<PlanInputs, PlanInputProblem>> {
  const project = await deps.projects.find(run.userId, run.projectId);
  if (project === undefined) return err(problems.project);
  const ref = { userId: run.userId, projectId: run.projectId };
  const brief = await deps.briefs.read(ref);
  if (brief === undefined) return err(problems.brief);
  const sourceRun = await sourceRunOf(deps.runs, run);
  if (sourceRun === undefined) return err(problems.run);
  const cards = await deps.cards.cardsOf(scopeOf(sourceRun));
  if (supportedCards(cards).length === 0) return err(problems.claims);
  const questions = await deps.answers.questionsOf(ref, sourceRun.runKey);
  return ok({ project, brief, sourceRun, cards, questions });
}
