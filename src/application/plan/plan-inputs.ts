import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { supportedCards, type SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { Run } from '../../domain/runs/run.js';
import type { UploadFacts } from '../../domain/sources/upload-facts.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { AnswersFile, RecordedQuestion } from '../ports/answers-file.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunCards } from '../ports/run-cards.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ManifestSource } from '../../domain/runs/manifest-source.js';
import type { Project } from '../projects/project.js';
import { scopeOf } from '../runs/run-scope.js';
import { planSourceRun } from './plan-source.js';

// RF-604, RF-614, DEC-80: what a plan run is written from: the project, its saved planning brief, the
// understand run the plan was started from (the newest one that ended `Completed`, else the newest
// that ended `CapReached`, when none was named), that run's cards and the open questions it found with their answers. A project without a
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
  /** RF-131: the zip, its upload date and hash, for a project of kind `upload`. */
  readonly upload?: UploadFacts;
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
    message: 'There is no understand run that ended Completed or at its cap to plan from.',
  },
  missing: { code: ERROR_CODES.notFound, message: 'The source run of the plan run is gone.' },
  claims: {
    code: ERROR_CODES.planSourceMissing,
    message: 'The source understand run has no supported claim.',
  },
} as const;

/** RF-131: the zip, upload date and hash a manifest source holds; unknown parts are null. */
function factsOf(source: ManifestSource | undefined): UploadFacts {
  return {
    fileName: source?.fileName ?? null,
    uploadedAt: source?.uploadedAt ?? null,
    snapshotHash: source?.snapshotHash ?? null,
  };
}

/** RF-131, RF-156: what the manifest of the source run says of the zip or the workbooks. */
async function uploadFactsOf(
  manifests: Pick<RunManifestStore, 'read'> | undefined,
  sourceRun: Run,
  project: Pick<Project, 'sourceKind'>,
): Promise<UploadFacts> {
  const manifest = await manifests?.read(scopeOf(sourceRun));
  const facts = factsOf(manifest?.source);
  return project.sourceKind === 'workbook'
    ? { ...facts, workbooks: manifest?.source.workbooks ?? [] }
    : facts;
}

// RF-604, RF-614
export async function planInputs(
  deps: PlanInputDependencies,
  run: Pick<Run, 'userId' | 'projectId'>,
  /** The id of the run to plan from, as an option records it; anything but text names none. */
  sourceRunId?: unknown,
  /** RF-131: where the zip of an uploaded project is read from; the plan estimate needs none. */
  manifests?: Pick<RunManifestStore, 'read'>,
): Promise<Result<PlanInputs, PlanInputProblem>> {
  const project = await deps.projects.find(run.userId, run.projectId);
  if (project === undefined) return err(problems.project);
  const ref = { userId: run.userId, projectId: run.projectId };
  const brief = await deps.briefs.read(ref);
  if (brief === undefined) return err(problems.brief);
  const found = await planSourceRun(
    deps.runs,
    run,
    typeof sourceRunId === 'string' ? sourceRunId : undefined,
  );
  if (!found.ok) {
    return err(found.error === ERROR_CODES.notFound ? problems.missing : problems.run);
  }
  const sourceRun = found.value;
  const cards = await deps.cards.cardsOf(scopeOf(sourceRun));
  if (supportedCards(cards).length === 0) return err(problems.claims);
  const questions = await deps.answers.questionsOf(ref, sourceRun.runKey);
  const upload =
    project.sourceKind === 'github'
      ? undefined
      : await uploadFactsOf(manifests, sourceRun, project);
  return ok({
    project,
    brief,
    sourceRun,
    cards,
    questions,
    ...(upload === undefined ? {} : { upload }),
  });
}
