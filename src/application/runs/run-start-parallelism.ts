import type { Run } from '../../domain/runs/run.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { Project } from '../projects/project.js';
import { readerParallelism } from '../understand/reader-settings.js';

// RF-1002, RF-301, P8-59: the limit the live run page shows next to the calls a role has in flight.
// `run.started` records it as the run will use it: `agents.parallelism` brought inside its range by
// `readerParallelism`, the value the reader pool and the verifier's judgements both read. Only a
// stage that runs readers and the verifier has one; a run whose project cannot be read has none.

export interface StartParallelismDependencies {
  readonly projects: { find(userId: string, projectId: string): Promise<Project | undefined> };
}

/** The stages whose readers and verifier run `agents.parallelism` calls at once. */
const PARALLEL_STAGES: readonly RunStage[] = ['understand'];

// RF-1002
export class StartParallelism {
  private readonly deps: StartParallelismDependencies;

  constructor(deps: StartParallelismDependencies) {
    this.deps = deps;
  }

  /** The parallelism the run uses, or undefined for another stage or an unknown project. */
  // RF-1002
  async of(run: Run): Promise<number | undefined> {
    if (!PARALLEL_STAGES.includes(run.stage)) return undefined;
    const project = await this.deps.projects.find(run.userId, run.projectId);
    return project === undefined ? undefined : readerParallelism(project.settings);
  }
}
