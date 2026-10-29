import type { DraftColumn, DraftTable, ForeignKey, MergedTable } from './data-model.js';
import { isIdentifier } from './data-model-names.js';

// RF-603, RF-623, P7-13, EV-31, EV-40: the planner answers a table once for the entity and again
// for the service that reads it (`catalog_brand` and `catalog_brands`), or in two batches. Tables
// whose names differ only by plural, case or separators are one table: the first keeps its name,
// and the sources, columns, keys and rules of the others are united into it. A foreign key that
// pointed at a merged name now points at the table kept. A name that is not an identifier is never
// merged (it is refused later). Pure; no guess beyond the name.

/** The name without case, separators or a plural ending: `Catalog_Brands` and `catalogbrand` agree. */
function keyOf(name: string): string {
  const flat = name.toLowerCase().replace(/_/gu, '');
  if (flat.endsWith('ies')) return `${flat.slice(0, -3)}y`;
  if (/(?:sses|uses|xes|ches|shes|zes)$/u.test(flat)) return flat.slice(0, -2);
  return flat.endsWith('s') && !/(?:ss|us|is)$/u.test(flat) ? flat.slice(0, -1) : flat;
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

function united(first: DraftTable, rest: readonly DraftTable[]): DraftTable {
  if (rest.length === 0) return first;
  const group = [first, ...rest];
  const known = new Set(first.columns.map((column) => column.name));
  const added: DraftColumn[] = unique(
    rest.flatMap((each) => each.columns).filter((column) => !known.has(column.name)),
    (column) => column.name,
  );
  const columns = [...first.columns, ...added];
  const copied = group.every((each) => each.copiedFromLegacy === true);
  return {
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
    if (others.length > 0) merges.push({ kept, merged: others });
    for (const name of others) aliases.set(name, kept);
    return united(first, rest);
  });
  const pointed = tables.map((table) => ({
    ...table,
    foreignKeys: table.foreignKeys.map((key) => repointed(key, aliases)),
  }));
  return { tables: pointed, merges };
}
