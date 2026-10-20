import { err, ok, type Result } from '../errors/result.js';
import { appendClaims, type Card, type CardProblem } from './card.js';
import { extendedCardOf, withAllowedReplaces, type TaskCards } from './card-ids.js';

// RF-209, RF-203, DEC-158: the claims a Deepen task adds to cards the parent run holds. A draft that
// names a card the task was given (`extends`) is not a new card (`assignCardIds` leaves it out):
// its claims go on that card, which keeps its id, title, summary and every claim it has; the new
// claims are numbered after the last and wait for the citation check and the judgement like any claim.

/** What the extensions changed: the cards that got claims, and the new claims with their task. */
export interface CardExtension {
  readonly cards: readonly Card[];
  readonly claims: readonly { readonly claimId: string; readonly agentTaskId: string }[];
}

/** Adds the claims of one task's extending drafts to the cards, in draft order. */
function extendedBy(
  task: TaskCards,
  current: Map<string, Card>,
  held: readonly Card[],
): Result<CardExtension['claims'], CardProblem> {
  const claims: { claimId: string; agentTaskId: string }[] = [];
  for (const draft of task.drafts) {
    const target = extendedCardOf(draft, task, held);
    if (target === undefined) continue;
    const before = current.get(target.id) ?? target;
    const inputs = draft.claims.map((claim) => withAllowedReplaces(claim, task.replaceable));
    const extended = appendClaims(before, inputs);
    if (!extended.ok) return err(extended.error);
    current.set(target.id, extended.value);
    claims.push(
      ...extended.value.claims
        .slice(before.claims.length)
        .map(({ claimId }) => ({ claimId, agentTaskId: task.agentTaskId })),
    );
  }
  return ok(claims);
}

/**
 * The cards of `cards` that the tasks' extending drafts add claims to, in card order, and the new
 * claims. Drafts that name no card the task was given are not here: they are new cards.
 */
// RF-209
export function extendCards(
  tasks: readonly TaskCards[],
  cards: readonly Card[],
): Result<CardExtension, CardProblem> {
  const current = new Map<string, Card>();
  const claims: CardExtension['claims'][number][] = [];
  for (const task of tasks) {
    const added = extendedBy(task, current, cards);
    if (!added.ok) return err(added.error);
    claims.push(...added.value);
  }
  const changed = cards.flatMap((card) => current.get(card.id) ?? []);
  return ok({ cards: changed, claims });
}
