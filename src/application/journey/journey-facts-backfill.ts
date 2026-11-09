import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import type { JourneyFactsBackfill, PendingProject } from '../ports/journey-facts-store.js';
import type { Logger } from '../ports/logger.js';
import type { PlanningBriefStore } from '../ports/planning-brief-store.js';
import {
  openQuestionCounts,
  runFileFacts,
  type FactProblem,
  type JourneyFileDependencies,
} from './journey-file-facts.js';

// P8-139, DEC-226, data-model.md section 4: the runs and projects that existed before migration 0024
// get their journey facts once from their files. It runs in the background at start-up (and daily,
// when there is nothing left to do but one query), a few rows at a time, one short UPDATE per row,
// so it holds no lock for long. A fact whose file is missing, torn or another run's stays null and
// is logged; the row is marked filled all the same and is not read again. A fill never replaces a
// fact a writer has stored since (the store keeps it), nor the end of a run that ended again after
// the pass read it (the store compares the end time read, P8-143).

export interface JourneyBackfillDependencies extends JourneyFileDependencies {
  readonly briefs: Pick<PlanningBriefStore, 'read'>;
  readonly pending: JourneyFactsBackfill;
  readonly logger: Logger;
}

/** The rows read per step. */
const BATCH = 25;

function problemOf(deps: JourneyBackfillDependencies, run: Pick<Run, 'runKey' | 'userId'>) {
  return problemIn(deps, { userId: run.userId, runId: run.runKey }, `run ${run.runKey}`);
}

function problemIn(
  deps: JourneyBackfillDependencies,
  ids: { readonly userId: string; readonly runId?: string },
  what: string,
): FactProblem {
  return (fact, error) =>
    deps.logger.log({
      level: 'warn',
      logger: 'journey',
      message: `The journey fact ${fact} of ${what} could not be read from its files; it stays empty.`,
      ...ids,
      ...(error instanceof RosettaError ? { code: error.code } : {}),
      data: { fact },
    });
}

/** The open questions of every family of the run's project; none when its files cannot be read. */
async function countsOf(deps: JourneyBackfillDependencies, run: Run) {
  try {
    return await openQuestionCounts(deps, await deps.runs.list(run.userId, run.projectId));
  } catch (error) {
    await problemOf(deps, run)('openQuestions', error);
    return new Map<string, number>();
  }
}

async function fillRuns(deps: JourneyBackfillDependencies, runs: readonly Run[]): Promise<void> {
  const counts = new Map<string, ReadonlyMap<string, number>>();
  for (const run of runs) {
    const project = counts.get(run.projectId) ?? (await countsOf(deps, run));
    counts.set(run.projectId, project);
    const projectRuns = await deps.runs.list(run.userId, run.projectId);
    const facts = await runFileFacts(deps, run, projectRuns, problemOf(deps, run));
    await deps.pending.fillRun(run, { ...facts, openQuestions: project.get(run.id) ?? null });
  }
}

async function fillProject(deps: JourneyBackfillDependencies, project: PendingProject) {
  const savedAt = await briefSavedAtOf(deps, project);
  await deps.pending.fillProject(project.projectId, savedAt);
}

async function briefSavedAtOf(deps: JourneyBackfillDependencies, project: PendingProject) {
  try {
    const brief = await deps.briefs.read(project);
    return brief === undefined ? null : Date.parse(brief.savedAt);
  } catch (error) {
    const what = `project ${project.projectId}`;
    await problemIn(deps, { userId: project.userId }, what)('briefSavedAt', error);
    return null;
  }
}

// RF-615
export async function backfillJourneyFacts(deps: JourneyBackfillDependencies): Promise<void> {
  for (let runs = await deps.pending.pendingRuns(BATCH); runs.length > 0;) {
    await fillRuns(deps, runs);
    runs = await deps.pending.pendingRuns(BATCH);
  }
  for (let projects = await deps.pending.pendingProjects(BATCH); projects.length > 0;) {
    for (const project of projects) await fillProject(deps, project);
    projects = await deps.pending.pendingProjects(BATCH);
  }
}
