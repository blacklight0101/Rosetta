import type { Run } from '../../domain/runs/run.js';
import type { Project } from '../projects/project.js';

// RF-1002, RF-301, P8-59: placeholder (DEC-191); the next commit records the parallelism.

export interface StartParallelismDependencies {
  readonly projects: { find(userId: string, projectId: string): Promise<Project | undefined> };
}

// RF-1002
export class StartParallelism {
  private readonly deps: StartParallelismDependencies;

  constructor(deps: StartParallelismDependencies) {
    this.deps = deps;
  }

  /** The parallelism the run uses; undefined until it is built. */
  // RF-1002
  async of(run: Run): Promise<number | undefined> {
    await this.deps.projects.find(run.userId, run.projectId);
    return undefined;
  }
}
