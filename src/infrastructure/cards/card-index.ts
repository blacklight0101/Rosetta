import { countClaims, type Card } from '../../domain/cards/card.js';
import { CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import { byCodeUnit } from '../../domain/code-map/code-unit-order.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { maskDeep } from '../guards/mask-deep.js';
import { cardPath } from './card-markdown.js';

// RF-204, RF-302, data-model 3.7: `cards/index.json`, every card with its claim counts per status,
// sorted by id. It holds no times, so the same cards always give the same bytes (RF-106).

const schemaVersion = 1;

function numberOf(id: string): number {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}

/** `BR-002` before `BR-010`, types in code-unit order. */
function compareIds(left: Card, right: Card): number {
  return byCodeUnit(left.type, right.type) || numberOf(left.id) - numberOf(right.id);
}

function entryOf(card: Card): Record<string, unknown> {
  const counts = countClaims(card);
  return {
    id: card.id,
    type: card.type,
    title: card.title,
    area: card.area,
    path: cardPath(card),
    claimCounts: Object.fromEntries(CLAIM_STATUSES.map((status) => [status, counts[status]])),
  };
}

export function serialiseCardIndex(cards: readonly Card[], masker: TextMasker): string {
  const entries = [...cards].sort(compareIds).map(entryOf);
  const masked = maskDeep({ schemaVersion, cards: entries }, masker);
  return `${JSON.stringify(masked, null, 2)}\n`;
}
