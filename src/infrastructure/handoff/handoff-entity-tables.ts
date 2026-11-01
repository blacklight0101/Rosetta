import type { DraftEntity } from '../../domain/planning/plan-draft.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';

// P5-33, RF-601, RF-623: the target of a legacy entity is the table (or tables) of the data model of
// the same package, never the name the planner wrote for the entity. A table belongs to an entity
// when they share a source card; failing that, when the table is named like the legacy entity
// (ignoring case, underscores, a `tbl` prefix and a final `s`). No match means no table.

const plain = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
    .replace(/^tbl/u, '')
    .replace(/s$/u, '');

/** The names of the tables the entity maps to, in the order of the data model; empty for none. */
export function tablesOfEntity(entity: DraftEntity, model: TargetDataModel): string[] {
  const cards = new Set(entity.sources);
  const shared = model.tables.filter((table) => table.sources.some((card) => cards.has(card)));
  const named = model.tables.filter((table) => {
    const key = plain(table.name);
    return key !== '' && key === plain(entity.legacy);
  });
  return (shared.length > 0 ? shared : named).map((table) => table.name);
}

/**
 * P7-32: for a legacy sheet that was made one table with others (one sheet per site or copy), the
 * column and the value its rows get, so the data migration can fill the column. A sheet is told
 * from the others by its name, failing that by a source card only it has.
 */
export function splitNotesOf(entity: DraftEntity, model: TargetDataModel): string[] {
  const cards = new Set(entity.sources);
  return (model.splits ?? []).flatMap((split) => {
    const named = split.values.filter((each) => plain(each.sheet) === plain(entity.legacy));
    const shared = split.values.filter((each) => each.sources.some((card) => cards.has(card)));
    const own = named.length > 0 ? named : shared.length === 1 ? shared : [];
    return own.map((each) =>
      each.value === null
        ? `The rows of the sheet ${each.sheet} go to ${split.table} and leave its ${split.column} column empty.`
        : `The rows of the sheet ${each.sheet} go to ${split.table} with ${split.column} = ${each.value}.`,
    );
  });
}
