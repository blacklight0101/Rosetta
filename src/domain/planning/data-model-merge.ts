import type { DraftColumn, DraftTable, ForeignKey, MergedTable } from './data-model.js';
import { isIdentifier } from './data-model-names.js';

// RF-603, RF-623, P7-13, EV-31, EV-40: the planner answers a table once for the entity and again
// for the service that reads it (`catalog_brand` and `catalog_brands`), or in two batches. Tables
// whose names differ only by plural, case or separators are one table: the first keeps its name,
// and the sources, columns, keys and rules of the others are united into it. The columns are
// united by the same key (`picture_file_name` and `picturefilename` are one column, the first
// spelling kept), and the keys of the others follow the rename. A foreign key that pointed at a
// merged name now points at the table kept. A name that is not an identifier is never merged (it is
// refused later). Pure; no guess beyond the name.

/** Words that end in s without being a plural; a word of three letters or fewer is never cut. */
const notPlural = new Set(['news', 'series', 'species', 'lens', 'physics', 'mathematics']);

function singular(word: string): string {
  if (word.length <= 3 || notPlural.has(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(?:sses|uses|xes|ches|shes|zes)$/u.test(word)) return word.slice(0, -2);
  return word.endsWith('s') && !/(?:ss|us|is)$/u.test(word) ? word.slice(0, -1) : word;
}

/**
 * The name without case, separators or a plural ending: `Catalog_Brands` and `catalogbrand` agree.
 * A name with a part of one letter keeps its separators (`u_ser` is not `user`).
 */
function keyOf(name: string): string {
  const lower = name.toLowerCase();
  const parts = lower.split('_');
  return singular(parts.every((part) => part.length >= 2) ? parts.join('') : lower);
}

function unique<T>(items: readonly T[], keyed: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyed(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The columns of the others that the first lacks, and the rename of each twin to the spelling kept. */
function columnsOf(first: DraftTable, rest: readonly DraftTable[]) {
  const kept = new Map(first.columns.map((column) => [keyOf(column.name), column.name]));
  const renames = new Map<string, string>();
  const added: DraftColumn[] = [];
  for (const column of rest.flatMap((each) => each.columns)) {
    const key = keyOf(column.name);
    const at = kept.get(key);
    if (at === undefined) {
      kept.set(key, column.name);
      added.push(column);
    } else if (at !== column.name) {
      renames.set(column.name, at);
    }
  }
  return { columns: [...first.columns, ...added], renames };
}

function renamed(names: readonly string[], renames: ReadonlyMap<string, string>): string[] {
  return names.map((name) => renames.get(name) ?? name);
}

function followed(table: DraftTable, renames: ReadonlyMap<string, string>): DraftTable {
  return {
    ...table,
    primaryKey: renamed(table.primaryKey, renames),
    uniqueKeys: table.uniqueKeys.map((key) => renamed(key, renames)),
    foreignKeys: table.foreignKeys.map((key) => ({
      ...key,
      columns: renamed(key.columns, renames),
    })),
    indexes: table.indexes.map((index) => ({ ...index, columns: renamed(index.columns, renames) })),
  };
}

function united(first: DraftTable, others: readonly DraftTable[]) {
  const { columns, renames } = columnsOf(first, others);
  const rest = others.map((each) => followed(each, renames));
  const group = [first, ...rest];
  const copied = group.every((each) => each.copiedFromLegacy === true);
  const table: DraftTable = {
    ...first,
    purpose: group.map((each) => each.purpose).find((text) => text !== '') ?? '',
    sources: unique(
      group.flatMap((each) => each.sources),
      (id) => id,
    ),
    columns,
    primaryKey: group.find((each) => each.primaryKey.length > 0)?.primaryKey ?? [],
    uniqueKeys: unique(
      group.flatMap((each) => each.uniqueKeys),
      (key) => key.join('\0'),
    ),
    foreignKeys: unique(
      group.flatMap((each) => each.foreignKeys),
      (key) => JSON.stringify(key),
    ),
    checks: unique(
      group.flatMap((each) => each.checks),
      (text) => text,
    ),
    indexes: unique(
      group.flatMap((each) => each.indexes),
      (index) => `${index.columns.join('\0')}\0${String(index.unique)}`,
    ),
    ...(copied ? { copiedFromLegacy: true } : { copiedFromLegacy: undefined }),
  };
  return { table, twins: [...renames.keys()] };
}

function repointed(key: ForeignKey, aliases: ReadonlyMap<string, string>): ForeignKey {
  const kept = aliases.get(key.references);
  return kept === undefined ? key : { ...key, references: kept };
}

// RF-623
export function mergedDrafts(drafts: readonly DraftTable[]): {
  readonly tables: DraftTable[];
  readonly merges: MergedTable[];
} {
  const groups = new Map<string, { first: DraftTable; rest: DraftTable[] }>();
  drafts.forEach((draft, at) => {
    const key = isIdentifier(draft.name) ? keyOf(draft.name) : `\0${String(at)}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { first: draft, rest: [] });
    else group.rest.push(draft);
  });
  const merges: MergedTable[] = [];
  const aliases = new Map<string, string>();
  const tables = [...groups.values()].map(({ first, rest }) => {
    const kept = first.name;
    const others = unique(
      rest.map((each) => each.name).filter((name) => name !== kept),
      (name) => name,
    );
    const { table, twins } = united(first, rest);
    if (others.length > 0) {
      merges.push({ kept, merged: others, ...(twins.length > 0 ? { columns: twins } : {}) });
    }
    for (const name of others) aliases.set(name, kept);
    return table;
  });
  const pointed = tables.map((table) => ({
    ...table,
    foreignKeys: table.foreignKeys.map((key) => repointed(key, aliases)),
  }));
  return { tables: pointed, merges };
}
