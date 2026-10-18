import { areaCoverage } from '../../domain/cards/area-coverage.js';
import type { Card } from '../../domain/cards/card.js';
import type { TaskCards } from '../../domain/cards/card-ids.js';
import type { TaskResult } from '../ports/task-results.js';
import { scopeOf } from '../runs/run-scope.js';
import { areaFailureOf } from '../understand/area-failure.js';
import { cardNoteOf, coverageNoteOf } from '../understand/area-notes.js';
import { recordTaskState } from '../understand/reader-task.js';
import type { ReaderTask } from '../understand/reader-tasks.js';
import { readerParallelism } from '../understand/reader-settings.js';
import { TaskReads } from '../understand/run-coverage.js';
import { failedOutcome, type TaskOutcome } from '../understand/session-outcome.js';
import { TaskLog } from '../understand/task-log.js';
import { runPool } from '../understand/task-pool.js';
import { runReaderTaskWithRetry } from '../understand/task-retry.js';
import type { DeepenParts } from './deepen-parts.js';

// RF-209, RF-200, RF-230: the reader tasks of one Deepen round, run like the tasks of any
// understand run (the same guarded reader, the same retry, at most `agents.parallelism` at once,
// each listed in the manifest and published as events), and what each leaves: its drafts, with the
// rejected claims it may name as replaced, and its coverage.

export interface EndedTask {
  readonly task: ReaderTask;
  readonly outcome: TaskOutcome;
  readonly reads: TaskReads;
}

async function announcePlanned(parts: DeepenParts, task: ReaderTask): Promise<void> {
  await recordTaskState(parts, task, { state: 'Planned', turns: 0, cards: 0 });
  const data = { area: task.area.name, role: 'reader', model: parts.role.model };
  await parts.execution.events.emit('agent.planned', data, task.agentTaskId);
}

async function runOne(parts: DeepenParts, task: ReaderTask, log: TaskLog): Promise<EndedTask> {
  const reads = new TaskReads();
  const outcome: TaskOutcome = await runReaderTaskWithRetry(parts, task, reads).catch(
    async (error: unknown) => {
      await log.failure(task, error);
      return failedOutcome(error);
    },
  );
  if (outcome.rawOutputs.length > 0) {
    const scope = scopeOf(parts.execution.run);
    await parts.deps.cards.writeInvalidOutput(scope, task.agentTaskId, outcome.rawOutputs);
  }
  const progress = { state: outcome.state, turns: outcome.turns, cards: outcome.drafts.length };
  await recordTaskState(parts, task, progress);
  await parts.execution.events.emit('agent.ended', progress, task.agentTaskId);
  return { task, outcome, reads };
}

/** Runs the round's tasks; the ended ones in task order, whatever order they ended in. */
// RF-209, RF-200
export async function runRoundTasks(
  parts: DeepenParts,
  tasks: readonly ReaderTask[],
): Promise<readonly EndedTask[]> {
  for (const task of tasks) await announcePlanned(parts, task);
  const log = new TaskLog(parts.logger, parts.execution.run.runKey);
  const ended = new Map<string, EndedTask>();
  const options = {
    parallelism: readerParallelism(parts.settings),
    signal: parts.execution.signal,
  };
  await runPool(tasks, options, async (task) => {
    ended.set(task.agentTaskId, await runOne(parts, task, log));
  });
  return tasks.flatMap((task) => ended.get(task.agentTaskId) ?? []);
}

/** RF-209: the drafts of an ended task, with the claims it was given to re-read. */
export function taskCardsOf({ task, outcome }: EndedTask): TaskCards {
  const note = cardNoteOf(outcome.areaRead);
  return {
    agentTaskId: task.agentTaskId,
    area: task.area.name,
    drafts: outcome.drafts,
    ...(task.replaceable === undefined ? {} : { replaceable: task.replaceable }),
    ...(note === undefined ? {} : { note }),
  };
}

/** RF-006, RF-230: what the task leaves for the results a resume reads back. */
export function taskResultOfRound(
  parts: Pick<DeepenParts, 'scanned'>,
  ended: EndedTask,
  cards: readonly Card[],
): TaskResult {
  const { task, outcome, reads } = ended;
  const coverage = areaCoverage(task.area, parts.scanned.codeMap.files, reads.all());
  const failure = areaFailureOf(outcome);
  const note = coverageNoteOf(outcome.areaRead, false);
  // A re-read that finds nothing to say about a rejected claim writes nothing: that is no gap.
  const gap = task.rejected === undefined;
  return {
    agentTaskId: task.agentTaskId,
    area: task.area.name,
    state: outcome.state,
    turns: outcome.turns,
    withoutCards: gap && outcome.state === 'Done' && outcome.drafts.length === 0,
    cards: cards.filter((card) => card.agentTaskId === task.agentTaskId),
    coverage: {
      ...coverage,
      ...(failure === undefined ? {} : { failure }),
      ...(note === undefined ? {} : { note }),
    },
  };
}
