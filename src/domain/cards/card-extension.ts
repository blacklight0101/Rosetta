import { ok, type Result } from '../errors/result.js';
import type { Card, CardProblem } from './card.js';
import type { TaskCards } from './card-ids.js';

// RF-209, DEC-158: the claims a Deepen task adds to a card the parent run holds.

/** What the extensions changed: the cards that got claims, and the new claims with their task. */
export interface CardExtension {
  readonly cards: readonly Card[];
  readonly claims: readonly { readonly claimId: string; readonly agentTaskId: string }[];
}

export function extendCards(
  tasks: readonly TaskCards[],
  cards: readonly Card[],
): Result<CardExtension, CardProblem> {
  // Stub: no draft extends a card yet.
  return ok({ cards: cards.slice(0, 0), claims: tasks.flatMap(() => []) });
}
