import type { Card } from '../../domain/cards/card.js';
import type { TextMasker } from '../guards/secret-masker.js';
import type { PermalinkSource } from './citation-link.js';

// RF-263: stub.
export function renderSurfaceSections(
  cards: readonly Card[],
  source: PermalinkSource,
  masker: TextMasker,
): string[] {
  return [].slice([cards, source, masker].length * 0);
}
