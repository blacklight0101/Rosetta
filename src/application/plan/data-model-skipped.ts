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

/** A line of the PRD "out of scope" section: its words and the cards it cites. */
export interface OutOfScopeLine {
  readonly text: string;
  readonly sources: readonly string[];
}

function wordsKey(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()} `;
}

/** The line that drops the table: it names the table, or cites every card the table is built from. */
function droppedBy(
  table: DraftTable,
  lines: readonly OutOfScopeLine[],
): OutOfScopeLine | undefined {
  const name = wordsKey(table.name);
  return lines.find(
    (line) =>
      (name.trim().length >= 3 && wordsKey(line.text).includes(name)) ||
      (table.sources.length > 0 && table.sources.every((id) => line.sources.includes(id))),
  );
}

/**
 * P7-32: the tables a PRD out-of-scope line drops (an empty sheet, a copy the new system leaves out)
 * are not written as tables; checks.md lists each with the line that dropped it.
 */
// RF-623
export function withoutOutOfScopeTables(
  tables: readonly DraftTable[],
  lines: readonly OutOfScopeLine[],
): { readonly tables: DraftTable[]; readonly skipped: DataModelProblem[] } {
  const skipped: DataModelProblem[] = [];
  const kept = tables.filter((table) => {
    const line = droppedBy(table, lines);
    if (line === undefined) return true;
    skipped.push({
      ...{ item: table.name, field: 'table', kind: 'check' as const },
      reason: `The PRD lists this table out of scope ("${line.text}"), so the model has no table for it; add one if it is needed.`,
    });
    return false;
  });
  return { tables: kept, skipped };
}
