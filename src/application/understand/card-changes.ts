import type { Card } from '../../domain/cards/card.js';
import type { PriorCard } from '../ports/prior-cards.js';

// RF-241: the cards of a re-run that are new or changed, against the earlier cards of the same area.

export interface CardRef {
  readonly id: string;
  readonly title: string;
}

export interface CardChanges {
  readonly added: readonly CardRef[];
  readonly changed: readonly CardRef[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- red-step stub, replaced in the feat commit
export function compareCards(_cards: readonly Card[], _prior: readonly PriorCard[]): CardChanges {
  return { added: [], changed: [] };
}
