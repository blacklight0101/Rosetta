import { err, ok, type Result } from '../errors/result.js';
import { createCard, type Card, type CardProblem, type ClaimInput } from './card.js';
import type { CardType, Confidence } from './card-vocabulary.js';
import type { FlowDetail, ScreenDetail } from './flow-screen.js';

// RF-203, DEC-43: ids are numbered per run, per type, in order of area and appearance.

/** One card as the agent proposed it, before the run gives it an id. */
export interface CardDraft {
  readonly type: CardType;
  readonly title: string;
  readonly summary: string;
  /** What the agent wrote; the task's own area is the one a card gets. */
  readonly area: string;
  readonly confidence: Confidence;
  readonly claims: readonly ClaimInput[];
  readonly question?: string | undefined;
  readonly whyItMatters?: string | undefined;
  readonly flow?: FlowDetail | undefined;
  readonly screen?: ScreenDetail | undefined;
}

/** The drafts of one finished agent task, in the order the agent wrote them. */
export interface TaskCards {
  readonly agentTaskId: string;
  readonly area: string;
  readonly drafts: readonly CardDraft[];
}

/** `BR-007`: three digits at least, more when a run has more than 999 cards of a type. */
export function formatCardId(type: CardType, number: number): string {
  return `${type}-${String(number).padStart(3, '0')}`;
}

/** Gives every draft its id; `tasks` must already be in area order. */
export function assignCardIds(tasks: readonly TaskCards[]): Result<readonly Card[], CardProblem> {
  const counters = new Map<CardType, number>();
  const cards: Card[] = [];
  for (const task of tasks) {
    for (const draft of task.drafts) {
      const number = (counters.get(draft.type) ?? 0) + 1;
      counters.set(draft.type, number);
      const card = createCard({
        ...draft,
        id: formatCardId(draft.type, number),
        area: task.area,
        agentTaskId: task.agentTaskId,
      });
      if (!card.ok) return err(card.error);
      cards.push(card.value);
    }
  }
  return ok(cards);
}
