import { err, ok, type Result } from '../errors/result.js';
import { createCard, type Card, type CardProblem, type ClaimInput } from './card.js';
import { EXTENDABLE_TYPES, type CardType, type Confidence } from './card-vocabulary.js';
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
  /** RF-209: the id of the listed card a Deepen task's claims belong to. */
  readonly extends?: string | undefined;
}

/** The drafts of one finished agent task, in the order the agent wrote them. */
export interface TaskCards {
  readonly agentTaskId: string;
  readonly area: string;
  readonly drafts: readonly CardDraft[];
  /** RF-206: a note every card of the task carries, for example it was written without reading. */
  readonly note?: string;
  /** RF-209: the rejected claims a Deepen re-read was given; only these may be named by `replaces`. */
  readonly replaceable?: readonly string[];
  /** RF-209: the ids of the parent's cards the task was given; only these may be named by `extends`. */
  readonly extendable?: readonly string[];
}

/** The number in an id such as `BR-007`. */
function numberOf(id: string): number {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}

/** `BR-007`: three digits at least, more when a run has more than 999 cards of a type. */
export function formatCardId(type: CardType, number: number): string {
  return `${type}-${String(number).padStart(3, '0')}`;
}

/** RF-209: `replaces` names a claim the task was given to re-read, or it is dropped (the claim stays). */
export function withAllowedReplaces(
  claim: ClaimInput,
  replaceable: readonly string[] = [],
): ClaimInput {
  if (claim.replaces === undefined || replaceable.includes(claim.replaces)) return claim;
  const { text, citations, target, branches } = claim;
  return { text, citations, target, branches };
}

/**
 * RF-209, DEC-158: the card a draft of a Deepen task adds its claims to, when it names one the task
 * was given (`extends`) that the run holds with the draft's own type; otherwise none, and the draft
 * is a new card, so a wrong id never costs the draft.
 */
export function extendedCardOf(
  draft: CardDraft,
  task: Pick<TaskCards, 'extendable'>,
  cards: readonly Card[],
): Card | undefined {
  const { extends: id } = draft;
  if (id === undefined || !(task.extendable ?? []).includes(id)) return undefined;
  if (!EXTENDABLE_TYPES.includes(draft.type)) return undefined;
  return cards.find((card) => card.id === id && card.type === draft.type);
}

/**
 * Gives every draft its id; `tasks` must already be in area order. Ids continue after the cards
 * in `after` (a resumed run keeps the ids it already gave, RF-006).
 */
export function assignCardIds(
  tasks: readonly TaskCards[],
  after: readonly Card[] = [],
): Result<readonly Card[], CardProblem> {
  const counters = new Map<CardType, number>();
  for (const card of after) {
    counters.set(card.type, Math.max(counters.get(card.type) ?? 0, numberOf(card.id)));
  }
  const cards: Card[] = [];
  for (const task of tasks) {
    for (const draft of task.drafts) {
      if (extendedCardOf(draft, task, after) !== undefined) continue;
      const number = (counters.get(draft.type) ?? 0) + 1;
      counters.set(draft.type, number);
      const card = createCard({
        ...draft,
        claims: draft.claims.map((claim) => withAllowedReplaces(claim, task.replaceable)),
        id: formatCardId(draft.type, number),
        area: task.area,
        agentTaskId: task.agentTaskId,
        note: task.note,
      });
      if (!card.ok) return err(card.error);
      cards.push(card.value);
    }
  }
  return ok(cards);
}
