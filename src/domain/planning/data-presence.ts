import type { ModelTable } from './data-model.js';
import type { SourceCard } from './plan-sources.js';

// P6-27, RF-610, DEC-190: stub, written with the failing tests and replaced by the change.

export function hasData(
  cards: readonly Pick<SourceCard, 'type' | 'claims'>[],
  tables: readonly ModelTable[],
): boolean {
  return cards.length + tables.length >= 0;
}
