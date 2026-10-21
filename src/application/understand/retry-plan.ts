import type { Card } from '../../domain/cards/card.js';
import type { Area } from '../../domain/code-map/area.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { nextTaskNumber } from '../deepen/deepen-tasks.js';
import { seededCounts, type SeededCounts } from '../deepen/deepen-events.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { RunIndex } from '../ports/run-index.js';
import type { RunManifestStore } from '../ports/run-manifest-store.js';
import type { TaskResult, TaskResults } from '../ports/task-results.js';
import { scopeOf } from '../runs/run-scope.js';
import { planResume, type ResumePlan } from './resume-plan.js';
import { planRunTasks } from './resume-state.js';
import type { ReaderTask } from './reader-tasks.js';
import type { UnderstandOptions } from './understand-options.js';

// RF-208, RF-209, RF-006, Q-43 (default applies): the tasks of a run that retries the failed areas of
// another run. Like a Deepen it starts from the task results of the run it retries (their cards,
// claim statuses and coverage, copied: that run stays as it was), but it reads only the areas that
// gave no usable card there (or that run never read). Every other area is held as it was, so the
// retry never has fewer Supported claims than the run it retries, whether its own areas work or
// fail again. A retried area keeps the task id of its failed task, a new one takes the next number,
// so card ids go on after every card the run holds (RF-203). The code map must be the one that run
// read, or the held citations would point at other lines.

/** What a retry needs of the scanned source: its hash and its areas. */
export interface RetrySource {
  readonly codeMapHash: string;
  readonly codeMap: Pick<CodeMap, 'areas'>;
}

export interface RetryDependencies {
  readonly runs: Pick<RunIndex, 'find'>;
  readonly manifests: Pick<RunManifestStore, 'read'>;
  readonly taskResults: TaskResults;
}

/** What the run says of the retry: the run it retries and what it starts from. */
export interface RetryLink {
  readonly parentRunId: string;
  readonly parentRunKey: string;
  /** The areas this run reads again. */
  readonly areas: number;
  readonly seeded: SeededCounts;
}

export interface RetryPlan {
  readonly plan: ResumePlan;
  /** Every task of the run in area order: the held ones and those it reads again. */
  readonly allTasks: readonly ReaderTask[];
  readonly link: RetryLink;
}

const failedIn = (result: TaskResult): boolean => result.coverage.failure !== undefined;

/** The tasks to read again, with the task id of the failed result of their area or the next number. */
function retriedTasks(
  tasks: readonly ReaderTask[],
  results: readonly TaskResult[],
): readonly ReaderTask[] {
  const failed = results.filter(failedIn);
  const read = new Set(results.map((result) => result.area));
  const wanted = tasks.filter(
    (task) => failed.some((result) => result.area === task.area.name) || !read.has(task.area.name),
  );
  let next = nextTaskNumber(results);
  return wanted.map((task) => {
    const earlier = failed.find((result) => result.area === task.area.name);
    if (earlier !== undefined) return { ...task, agentTaskId: earlier.agentTaskId };
    const agentTaskId = `reader-${String(next).padStart(3, '0')}`;
    next += 1;
    return { ...task, agentTaskId };
  });
}

/** The tasks of the held results, over the code map's areas, and those to read again, in area order. */
function inAreaOrder(
  areas: readonly Area[],
  held: readonly TaskResult[],
  retried: readonly ReaderTask[],
): readonly ReaderTask[] {
  const heldTasks = held.flatMap((result) => {
    const area = areas.find((each) => each.name === result.area);
    return area === undefined ? [] : [{ agentTaskId: result.agentTaskId, area }];
  });
  const rank = (task: ReaderTask): number => areas.findIndex((a) => a.name === task.area.name);
  return [...heldTasks, ...retried].sort(
    (left, right) =>
      rank(left) - rank(right) || left.agentTaskId.localeCompare(right.agentTaskId, 'en'),
  );
}

/** RF-006: a resumed retry goes on from the tasks it finished; the held results never change. */
async function planRetried(
  deps: RetryDependencies,
  execution: Pick<RunExecution, 'run' | 'manifest'>,
  retried: readonly ReaderTask[],
): Promise<ResumePlan> {
  const { manifest, run } = execution;
  if (manifest.agentTasks.length === 0) return { tasks: retried, kept: [] };
  return planResume(retried, manifest.agentTasks, await deps.taskResults.read(scopeOf(run)));
}

/** The cards the held results carry. */
const cardsOfResults = (results: readonly TaskResult[]): readonly Card[] =>
  results.flatMap((result) => result.cards);

// RF-208, Q-43
export async function planRetry(
  deps: RetryDependencies,
  execution: Pick<RunExecution, 'run' | 'manifest'>,
  input: {
    readonly parentRunId: string;
    readonly tasks: readonly ReaderTask[];
    readonly scanned: RetrySource;
  },
): Promise<Result<RetryPlan, ErrorCode>> {
  const { run } = execution;
  const parent = await deps.runs.find(run.userId, input.parentRunId);
  if (parent?.projectId !== run.projectId) return err(ERROR_CODES.notFound);
  const parentManifest = await deps.manifests.read(scopeOf(parent));
  if (parentManifest?.codemapHash !== input.scanned.codeMapHash) {
    return err(ERROR_CODES.resumeSourceChanged);
  }
  const results = await deps.taskResults.read(scopeOf(parent));
  if (results.length === 0) return err(ERROR_CODES.taskResultsUnreadable);
  const retried = retriedTasks(input.tasks, results);
  const again = new Set(retried.map((task) => task.agentTaskId));
  const held = results.filter((result) => !again.has(result.agentTaskId));
  const planned = await planRetried(deps, execution, retried);
  const link = {
    ...{ parentRunId: parent.id, parentRunKey: parent.runKey, areas: retried.length },
    seeded: seededCounts(cardsOfResults(held)),
  };
  const allTasks = inAreaOrder(input.scanned.codeMap.areas, held, retried);
  return ok({ plan: { tasks: planned.tasks, kept: [...held, ...planned.kept] }, allTasks, link });
}

/** What a run schedules: the tasks to run, the results it keeps and, for a retry, what it says of it. */
export interface Schedule {
  readonly plan: ResumePlan;
  readonly allTasks: readonly ReaderTask[];
  readonly link?: RetryLink;
}

/** RF-006, RF-208: a retry takes its plan from the run it retries, any other run from its own tasks. */
export async function scheduleTasks(
  deps: RetryDependencies,
  execution: Pick<RunExecution, 'run' | 'manifest'>,
  input: {
    readonly tasks: readonly ReaderTask[];
    readonly scanned: RetrySource;
    readonly options: UnderstandOptions;
  },
): Promise<Result<Schedule, ErrorCode>> {
  const { tasks, scanned, options } = input;
  if (options.retryOf === undefined) {
    const plan = await planRunTasks(deps.taskResults, execution, tasks);
    return ok({ plan, allTasks: tasks });
  }
  return planRetry(deps, execution, { parentRunId: options.retryOf, tasks, scanned });
}

/** RF-208: the run says which run it retries and what it starts from, before its agents are planned. */
export async function announceRetry(
  execution: Pick<RunExecution, 'events'>,
  link: RetryLink,
): Promise<void> {
  await execution.events.emit('retry.started', { ...link });
}
