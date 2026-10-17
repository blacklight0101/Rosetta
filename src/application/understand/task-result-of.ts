import type { Card } from '../../domain/cards/card.js';
import type { TaskResult } from '../ports/task-results.js';
import type { ReaderTask } from './reader-tasks.js';

/** How a task of this session ended: the part of its outcome a stored result needs. */
interface EndedHere {
  readonly state: TaskResult['state'];
  readonly turns: number;
  readonly drafts: readonly unknown[];
}

/**
 * RF-006: what a task left, to be stored for a resume: the result of this session when it ended
 * here, else the one an earlier session left (with its cards as they are now), else nothing.
 */
export function taskResultOf(
  task: ReaderTask,
  known: {
    readonly earlier: TaskResult | undefined;
    readonly end: EndedHere | undefined;
    readonly coverage: TaskResult['coverage'] | undefined;
    readonly cards: readonly Card[];
  },
): TaskResult | undefined {
  const { earlier, end, coverage } = known;
  const { agentTaskId } = task;
  if (coverage === undefined) return undefined;
  const cards = known.cards.filter((card) => card.agentTaskId === agentTaskId);
  if (end === undefined) return earlier === undefined ? undefined : { ...earlier, cards };
  const withoutCards = end.state === 'Done' && end.drafts.length === 0;
  const base = { agentTaskId, area: task.area.name, turns: end.turns, withoutCards };
  return { ...base, state: end.state, cards, coverage };
}
