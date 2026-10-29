import type { ModelTable } from './data-model.js';
import type { SourceCard } from './plan-sources.js';

// P6-27, RF-610, DEC-190: whether the understand run found data the plan has to build and move. A
// run has data when its data model has a table or a supported card of type `ENT` holds a claim.
// A plan without data gets no data-access card and no data-migration card (foundation-cards.ts).

/** True when the data model has a table or the supported cards hold an `ENT` claim. */
export function hasData(
  cards: readonly Pick<SourceCard, 'type' | 'claims'>[],
  tables: readonly ModelTable[],
): boolean {
  return tables.length > 0 || cards.some((card) => card.type === 'ENT' && card.claims.length > 0);
}
