import type { Card } from '../../domain/cards/card.js';
import { assignCardIds, type CardDraft, type TaskCards } from '../../domain/cards/card-ids.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { checkCitations, type CheckedCards } from '../verifier/citation-check.js';
import type { ReaderTask } from './reader-tasks.js';

// RF-203, RF-300, RF-302, P1-32 notes: the cards of an understand run as its tasks end. Card ids
// are given over the ended tasks in area order (never in the order the tasks happened to finish),
// and every claim then passes the citation check, so the cards written after each task are the run
// so far. With tasks running in parallel a later area can end first; its ids are final only once
// every task before it has ended, so the cards are announced (as events) per settled prefix.

export interface TaskEnd {
  readonly agentTaskId: string;
  readonly drafts: readonly CardDraft[];
  /** The task ended `Done` without a card: suspicious, so the area is named (P1-33). */
  readonly withoutCards: boolean;
  /** RF-206: a note for every card of the task. */
  readonly note?: string;
}

function taskCardsOf(task: ReaderTask, end: TaskEnd): TaskCards {
  const base = { agentTaskId: task.agentTaskId, area: task.area.name, drafts: end.drafts };
  return end.note === undefined ? base : { ...base, note: end.note };
}

/** What a resumed run keeps of the tasks that finished before (RF-006). */
export interface KeptCards {
  readonly cards: readonly Card[];
  /** The areas of kept tasks that ended `Done` without a card. */
  readonly areasWithoutCards: readonly string[];
}

export class RunCards {
  private readonly tasks: readonly ReaderTask[];
  private readonly ended = new Map<string, TaskEnd>();
  private readonly kept: KeptCards;
  private settled = 0;

  constructor(
    tasks: readonly ReaderTask[],
    kept: KeptCards = { cards: [], areasWithoutCards: [] },
  ) {
    this.tasks = tasks;
    this.kept = kept;
  }

  record(end: TaskEnd): void {
    this.ended.set(end.agentTaskId, end);
  }

  /** The cards of the ended tasks with their ids and the citation check (RF-203, RF-300). */
  // RF-203, RF-300
  checked(codeMap: Pick<CodeMap, 'files'>, at: string): CheckedCards {
    const done: TaskCards[] = this.tasks.flatMap((task) => {
      const end = this.ended.get(task.agentTaskId);
      return end === undefined ? [] : [taskCardsOf(task, end)];
    });
    const cards = assignCardIds(done, this.kept.cards);
    if (!cards.ok) throw new RosettaError(ERROR_CODES.cardOutputInvalid, cards.error);
    const checked = checkCitations(cards.value, codeMap, at);
    // RF-006: the cards of the tasks that finished before keep their ids and statuses.
    return { cards: [...this.kept.cards, ...checked.cards], checks: checked.checks };
  }

  /** The areas whose task ended without a card, in area order. */
  areasWithoutCards(): readonly string[] {
    const ran = this.tasks
      .filter((task) => this.ended.get(task.agentTaskId)?.withoutCards === true)
      .map((task) => task.area.name);
    return [...this.kept.areasWithoutCards, ...ran];
  }

  /**
   * The tasks whose card ids can no longer change and were not announced yet: those up to the
   * first task still open, or every ended task once the run is over.
   */
  takeSettled(final: boolean): ReadonlySet<string> {
    const taken = new Set<string>();
    while (this.settled < this.tasks.length) {
      const task = this.tasks[this.settled];
      if (task === undefined) break;
      const hasEnded = this.ended.has(task.agentTaskId);
      if (!hasEnded && !final) break;
      if (hasEnded) taken.add(task.agentTaskId);
      this.settled += 1;
    }
    return taken;
  }
}

/** The cards of the given tasks, in card order. */
export function cardsOf(cards: readonly Card[], tasks: ReadonlySet<string>): readonly Card[] {
  return cards.filter((card) => tasks.has(card.agentTaskId));
}
