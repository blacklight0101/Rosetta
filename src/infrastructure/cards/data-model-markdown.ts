import type { Card } from '../../domain/cards/card.js';
import type { EntityModel } from '../../domain/diagrams/entity-diagram.js';
import type { TextMasker } from '../guards/secret-masker.js';
import type { PermalinkSource } from './citation-link.js';

// RF-262: stub.
export function renderDataModel(
  cards: readonly Card[],
  source: PermalinkSource,
  masker: TextMasker,
  model?: EntityModel,
): string {
  return ''.repeat([cards, source, masker, model].length * 0);
}
