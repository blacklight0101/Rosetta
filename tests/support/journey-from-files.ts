import {
  openQuestionCounts,
  runFileFacts,
  type JourneyFileDependencies,
} from '../../src/application/journey/journey-file-facts.js';
import type { StoredRunFacts } from '../../src/application/ports/journey-facts-store.js';
import type { JourneyRecords } from '../../src/application/ports/journey-records.js';
import type { PlanningBriefStore } from '../../src/application/ports/planning-brief-store.js';
import type { ProjectRepository } from '../../src/application/ports/project-repository.js';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { Project } from '../../src/application/projects/project.js';
import { GetJourney } from '../../src/application/use-cases/get-journey.js';
import type { Run } from '../../src/domain/runs/run.js';

// P8-139, DEC-226, RF-615: the journey read over the facts the run files hold. The journey tests
// written before the facts were stored seed run files; this reads every fact from them with the
// derivation the writers and the backfill use, stores it on the rows the read sees, and asks the
// journey read, which reads the rows alone. So those tests, unchanged, prove that the stored facts
// give the strip the same journey the files gave it.

export interface FileJourneyDependencies extends JourneyFileDependencies {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly runs: Pick<RunIndex, 'list' | 'listQueued'>;
  readonly briefs: Pick<PlanningBriefStore, 'read'>;
  readonly journeys?: Pick<JourneyRecords, 'find'> | undefined;
}

/** The run with the facts that are not null, as the run index gives them back. */
function withFacts(run: Run, facts: StoredRunFacts): Run {
  const kept = Object.entries(facts).filter(([, value]) => value !== null);
  return { ...run, ...Object.fromEntries(kept) };
}

async function storedRuns(deps: FileJourneyDependencies, runs: readonly Run[]) {
  const counts = await openQuestionCounts(deps, runs);
  const ignore = () => Promise.resolve();
  return Promise.all(
    runs.map(async (run) => {
      const facts = await runFileFacts(deps, run, runs, ignore);
      return withFacts(run, { ...facts, openQuestions: counts.get(run.id) ?? null });
    }),
  );
}

async function storedProject(deps: FileJourneyDependencies, project: Project): Promise<Project> {
  const brief = await deps.briefs.read({ userId: project.userId, projectId: project.id });
  return brief === undefined ? project : { ...project, briefSavedAt: Date.parse(brief.savedAt) };
}

export function journeyFromFiles(deps: FileJourneyDependencies): GetJourney {
  return new GetJourney({
    projects: {
      find: async (userId, projectId) => {
        const project = await deps.projects.find(userId, projectId);
        return project === undefined ? undefined : storedProject(deps, project);
      },
    },
    runs: {
      list: async (userId, projectId) => storedRuns(deps, await deps.runs.list(userId, projectId)),
      listQueued: () => deps.runs.listQueued(),
    },
    journeys: deps.journeys,
  });
}
