import type { Actor } from '../../domain/accounts/actor.js';
import { queuePositions } from '../../domain/runs/queue-rules.js';
import type { Run } from '../../domain/runs/run.js';
import { totalsOf, type UsageTotals } from '../budget/cost-breakdown.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { Project } from '../projects/project.js';

// RF-1008, RF-1108, RF-1010, RF-1105: List project overview gives the Projects page each of the
// signed-in user's projects, newest first, with the number of its runs, its totals summed from the
// cost ledger (so a deleted run keeps its cost, DEC-55) and its latest run with the state and, while
// that run is queued, its position in the server's queue. Only the user's own projects and runs are
// read; the queue is read whole only to count the runs ahead.

export interface ProjectOverview {
  readonly project: Project;
  /** The project's runs in the run index, of every state. */
  readonly runs: number;
  readonly totals: UsageTotals;
  /** The newest run; undefined when the project has none. */
  readonly lastRun: Run | undefined;
  /** The queue position of `lastRun`, counted from 1; undefined when it is not queued. */
  readonly position: number | undefined;
}

export interface ListProjectOverviewDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly costs: CostTotals;
}

export class ListProjectOverview {
  private readonly deps: ListProjectOverviewDependencies;

  constructor(deps: ListProjectOverviewDependencies) {
    this.deps = deps;
  }

  // RF-1008
  async execute(request: { readonly actor: Actor }): Promise<readonly ProjectOverview[]> {
    const { projects, runs } = this.deps;
    const { userId } = request.actor;
    const [owned, queued] = await Promise.all([projects.list(userId), runs.listQueued()]);
    const positions = queuePositions(queued);
    const rows: ProjectOverview[] = [];
    for (const project of owned) rows.push(await this.rowOf(userId, project, positions));
    return rows;
  }

  private async rowOf(
    userId: string,
    project: Project,
    positions: ReadonlyMap<string, number>,
  ): Promise<ProjectOverview> {
    const [runs, groups] = await Promise.all([
      this.deps.runs.list(userId, project.id),
      this.deps.costs.projectGroups(userId, project.id),
    ]);
    const lastRun = runs[0];
    return {
      project,
      runs: runs.length,
      totals: totalsOf(groups),
      lastRun,
      position: lastRun === undefined ? undefined : positions.get(lastRun.id),
    };
  }
}
