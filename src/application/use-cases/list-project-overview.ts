import type { Actor } from '../../domain/accounts/actor.js';
import { queuePositions } from '../../domain/runs/queue-rules.js';
import type { Run } from '../../domain/runs/run.js';
import { totalsOf, type UsageTotals } from '../budget/cost-breakdown.js';
import type { Journey } from '../journey/journey.js';
import { journeyOfFacts } from '../journey/journey-of-facts.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { Project } from '../projects/project.js';

// RF-1008, RF-1108, RF-1010, RF-1105, RF-010: List project overview gives the Projects page each of
// the signed-in user's projects, newest first, with the number of its runs, its totals summed from
// the cost ledger (so a deleted run keeps its cost, DEC-55), its latest run with the state and, while
// that run is queued, its position in the server's queue, and its journey (P8-137, DEC-226): the
// stored facts turned by `journeyOfFacts`, the function the journey read uses, so the list and the
// strip of a project say the same. Only the user's own projects and runs are read, in a fixed number
// of reads (the projects, the runs and totals of all of them, and the queue) however many projects
// there are, and at most PROJECT_OVERVIEW_LIMIT projects (P1-137); the queue is read whole only to
// count the runs ahead. No journey record is read, so a journey here has no budget.

/**
 * The most projects one overview answers, the newest first. With the Projects page polling every
 * 5 s, this bounds the rows each poll reads and sends however many projects a user has. One more
 * project is read to tell whether the list is cut short (P1-163).
 */
const PROJECT_OVERVIEW_LIMIT = 100;

/** The overview rows and whether the user has more projects than the limit answers. */
export interface ProjectOverviewPage {
  readonly rows: readonly ProjectOverview[];
  /** True when the user has more projects than `rows` holds: only the newest ones are listed. */
  readonly truncated: boolean;
}

export interface ProjectOverview {
  readonly project: Project;
  /** The project's runs in the run index, of every state. */
  readonly runs: number;
  readonly totals: UsageTotals;
  /** The newest run; undefined when the project has none. */
  readonly lastRun: Run | undefined;
  /** The queue position of `lastRun`, counted from 1; undefined when it is not queued. */
  readonly position: number | undefined;
  /** RF-615, DEC-226: the journey of the project, as the journey read gives it but with no budget. */
  readonly journey: Journey | undefined;
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
  async execute(request: { readonly actor: Actor }): Promise<ProjectOverviewPage> {
    const { projects, runs, costs } = this.deps;
    const { userId } = request.actor;
    const read = await projects.list(userId, PROJECT_OVERVIEW_LIMIT + 1);
    const truncated = read.length > PROJECT_OVERVIEW_LIMIT;
    const owned = read.slice(0, PROJECT_OVERVIEW_LIMIT);
    const ids = owned.map((project) => project.id);
    const [all, groups, queued] = await Promise.all([
      runs.listOfProjects(userId, ids),
      costs.projectSummaries(userId, ids),
      runs.listQueued(),
    ]);
    const positions = queuePositions(queued);
    const byProject = runsByProject(all);
    const rows = owned.map((project): ProjectOverview => {
      const mine = byProject.get(project.id) ?? [];
      const lastRun = mine[0];
      return {
        ...{ project, runs: mine.length, lastRun },
        totals: totalsOf(groups.filter((group) => group.projectId === project.id)),
        position: lastRun === undefined ? undefined : positions.get(lastRun.id),
        journey: journeyOf(project, mine, positions),
      };
    });
    return { rows, truncated };
  }
}

/** The runs of each project, in the order they were read (newest first within a project). */
function runsByProject(runs: readonly Run[]): ReadonlyMap<string, readonly Run[]> {
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const group = groups.get(run.projectId);
    if (group === undefined) groups.set(run.projectId, [run]);
    else group.push(run);
  }
  return groups;
}

/** RF-615, DEC-226: the project's journey from its runs, newest first; none is named, so it is found. */
function journeyOf(
  project: Project,
  runs: readonly Run[],
  positions: ReadonlyMap<string, number>,
): Journey | undefined {
  const briefSavedAt = project.briefSavedAt ?? null;
  const journey = journeyOfFacts({ runs, briefSavedAt, record: undefined, positions });
  return journey.ok ? journey.value : undefined;
}
