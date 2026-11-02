import type { ModelTable } from './data-model.js';

// P6-27, P8-14, RF-610, DEC-190: whether the plan has data to build and move. One rule: the data model has
// a table. An entity card that stores nothing (a view model, a configuration) gives no table, and a card
// that stores data always gives one (the model is never left empty for it, RF-623), so an `ENT` claim
// alone is no reason for a data-access card, which waits for the migrations card that writes the tables.
// A plan without data gets no data-access, migrations or data-migration card (foundation-cards.ts).

/** True when the data model has a table. */
export function hasData(tables: readonly ModelTable[]): boolean {
  return tables.length > 0;
}
