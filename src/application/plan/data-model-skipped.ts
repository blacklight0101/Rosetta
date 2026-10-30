import type { DraftTable } from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import { noStoredData } from '../../domain/planning/stored-data-cards.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, P7-13, EV-31, EV-40: the `ENT` cards that describe no stored data (a configuration, a
// view model, a registration, a glossary, the workbook file) are not sent to the planner and get no
// table; checks.md lists each with its kind. A table the planner still builds only from such cards
// is taken out of its answer as well.

/** The cards without those that store nothing, the check rows that name them, and their ids. */
export interface Storeless {
  readonly cards: readonly SourceCard[];
  readonly skipped: readonly DataModelProblem[];
  readonly ids: ReadonlySet<string>;
}

// RF-623
export function withoutStorelessCards(cards: readonly SourceCard[]): Storeless {
  const kinds = new Map<string, string>();
  for (const card of cards) {
    const kind = card.type === 'ENT' ? noStoredData(card) : undefined;
    if (kind !== undefined) kinds.set(card.id, kind);
  }
  const skipped = [...kinds].map(([item, kind]) => ({
    ...{ item, field: 'entity card', kind: 'check' as const },
    reason: `The card describes no stored data (a ${kind}), so the model has no table for it; add one if it does.`,
  }));
  return {
    cards: cards.filter((card) => !kinds.has(card.id)),
    skipped,
    ids: new Set(kinds.keys()),
  };
}

/** The tables of the answer that are not built only from the cards that store nothing. */
// RF-623
export function withoutStorelessTables(
  tables: readonly DraftTable[],
  ids: ReadonlySet<string>,
): DraftTable[] {
  return tables.filter(
    (table) => table.sources.length === 0 || table.sources.some((id) => !ids.has(id)),
  );
}
