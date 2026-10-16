import type { Area } from '../../domain/code-map/area.js';
import type { AgentTaskResult } from '../agent/agent-task-result.js';
import { mergeDrafts } from '../agent/answer-collector.js';
import { runReaderTask, type ReaderTaskContext, type TaskAttempt } from './reader-task.js';
import { readerTaskSettings } from './reader-settings.js';
import type { ReaderTask } from './reader-tasks.js';
import type { TaskReads } from './run-coverage.js';

// RF-208, DEC-138: a reader task that ends with no usable card is run once more from the start,
// with a fresh conversation. An area the model's context was too small for is split in two and
// each half is read on its own. A retry is never retried, and the retry as a whole stays within one
// turn limit: a split gives each half half of it. Every call of a retry goes through the same
// guarded provider as the first run, so the budget guard counts it like any other (ADR-007).

/**
 * What ends a task without a card that a fresh start may mend: a bad answer, a model that loops,
 * and a conversation that used up its turns or its context. Stops, caps and failed calls do not.
 */
const retryReasons: ReadonlySet<AgentTaskResult['reason']> = new Set([
  'invalid-output',
  'repeated-calls',
  'unknown-tools',
  'context-limit',
  'max-turns',
]);

/** The task ended for a reason a fresh conversation may mend, and gave no card. */
// RF-208
export function needsRetry(result: AgentTaskResult): boolean {
  return result.drafts.length === 0 && retryReasons.has(result.reason);
}

/** The files of the area in two runs of about the same tokens; undefined for a one-file area. */
// RF-208
export function halvesOf(
  area: Area,
  tokensOf: (path: string) => number,
): readonly [Area, Area] | undefined {
  if (area.files.length < 2) return undefined;
  const total = area.files.reduce((sum, path) => sum + tokensOf(path), 0);
  let running = tokensOf(area.files[0] ?? '');
  let cut = 1;
  while (cut < area.files.length - 1 && running < total / 2) {
    running += tokensOf(area.files[cut] ?? '');
    cut += 1;
  }
  const part = (files: readonly string[]): Area => ({
    ...area,
    files,
    estimatedTokens: files.reduce((sum, path) => sum + tokensOf(path), 0),
  });
  return [part(area.files.slice(0, cut)), part(area.files.slice(cut))];
}

function lastWithCards(results: readonly AgentTaskResult[]): AgentTaskResult | undefined {
  return [...results].reverse().find((result) => result.drafts.length > 0);
}

/** The several runs of one task as one result: all cards, summed work, the end of the deciding run. */
// RF-208
export function combineResults(results: readonly AgentTaskResult[]): AgentTaskResult {
  const [first] = results;
  const decisive = lastWithCards(results) ?? results.at(-1);
  if (first === undefined || decisive === undefined) throw new Error('No result to combine.');
  const sum = (pick: (result: AgentTaskResult) => number): number =>
    results.reduce((total, result) => total + pick(result), 0);
  return {
    ...decisive,
    drafts: results.reduce<AgentTaskResult['drafts']>(
      (cards, result) => mergeDrafts(cards, result.drafts),
      [],
    ),
    rawOutputs: results.flatMap((result) => result.rawOutputs),
    turns: sum((result) => result.turns),
    toolErrors: sum((result) => result.toolErrors),
    usage: {
      inputTokens: sum((result) => result.usage.inputTokens),
      outputTokens: sum((result) => result.usage.outputTokens),
      cachedInputTokens: sum((result) => result.usage.cachedInputTokens),
    },
    modelVersion: results.reduce<string | null>((seen, r) => r.modelVersion ?? seen, null),
  };
}

/** What decides how a task is run again. */
interface RetryPlan {
  readonly task: ReaderTask;
  /** Why the task that failed ended. */
  readonly reason: AgentTaskResult['reason'];
  readonly tokensOf: (path: string) => number;
  /** The turn limit of one task. */
  readonly turns: number;
}

/**
 * The runs that retry a task: one fresh run, or after a context limit one per half of the area. The
 * halves share one turn limit, so the retry as a whole stays within it. A one-file area cannot be
 * split and would meet the same limit again, so it is not retried; with a limit of one turn there
 * is nothing to share, so the area is read whole.
 */
// RF-208
export function retryAttempts(plan: RetryPlan): readonly TaskAttempt[] {
  const { agentTaskId, area } = plan.task;
  const fresh: TaskAttempt = { callTaskId: `${agentTaskId}-retry`, area };
  if (plan.reason !== 'context-limit') return [fresh];
  const halves = halvesOf(area, plan.tokensOf);
  if (halves === undefined) return [];
  if (plan.turns < 2) return [fresh];
  const maxTurns = Math.floor(plan.turns / 2);
  return halves.map((half, index) => ({
    callTaskId: `${agentTaskId}-retry-${String(index + 1)}`,
    area: half,
    maxTurns,
  }));
}

function planOf(context: ReaderTaskContext, task: ReaderTask, after: AgentTaskResult): RetryPlan {
  const files = new Map(context.scanned.codeMap.files.map((file) => [file.path, file]));
  return {
    task,
    reason: after.reason,
    tokensOf: (path) => files.get(path)?.estimatedTokens ?? 0,
    turns: readerTaskSettings(context.settings, context.role).maxTurns,
  };
}

// RF-208
export async function runReaderTaskWithRetry(
  context: ReaderTaskContext,
  task: ReaderTask,
  reads: TaskReads,
): Promise<AgentTaskResult> {
  const first = await runReaderTask(context, task, reads);
  if (!needsRetry(first)) return first;
  const results = [first];
  for (const attempt of retryAttempts(planOf(context, task, first))) {
    results.push(await runReaderTask(context, task, reads, attempt));
  }
  return combineResults(results);
}
