import type { DraftColumn, DraftTable, SplitTable } from './data-model.js';
import { isIdentifier } from './data-model-names.js';
import { keyOf, repointed, united } from './data-model-merge.js';

// RF-623, P7-32: a workbook often has one sheet per site or per copy with the same columns
// (`access_point`, `access_point_site_a`, `access_point_site_b`). Tables that share a name stem and
// most of their columns, whose rest of the name is a suffix that is not a column, are one table:
// the sources, columns and rules of all are united, and a discriminator column (named from the kind
// of suffix, such as `site`, or `source_sheet` when the kind is unclear) holds the suffix of each
// sheet, so the data migration can fill it. The keys that pointed at any of them point at the one.
// Pure; no guess beyond the names and the columns.

const kinds = new Set([
  'site',
  'plant',
  'branch',
  'region',
  'warehouse',
  'store',
  'location',
  'office',
  'city',
  'country',
  'copy',
  'backup',
  'year',
  'month',
  'period',
  'version',
]);
const unclear = 'source_sheet';
const minShared = 3;
const minStem = 3;

interface Member {
  readonly table: DraftTable;
  readonly suffix: string;
}

const wordsOf = (name: string): string[] => name.toLowerCase().split('_');

function columnKeys(table: DraftTable): Set<string> {
  return new Set(table.columns.map((column) => keyOf(column.name)));
}

/** The members that share most columns with the one that has the most, and whose suffix is no column. */
function compatible(members: readonly Member[]): Member[] {
  const anchor = members.reduce((best, each) =>
    each.table.columns.length > best.table.columns.length ? each : best,
  );
  const anchorKeys = columnKeys(anchor.table);
  const same = members.filter(({ table }) => {
    const keys = columnKeys(table);
    const shared = [...keys].filter((key) => anchorKeys.has(key)).length;
    return shared >= minShared && shared * 2 > Math.max(keys.size, anchorKeys.size);
  });
  const all = new Set(same.flatMap(({ table }) => [...columnKeys(table)]));
  return same.filter(({ suffix }) => suffix === '' || !all.has(keyOf(suffix)));
}

/** The kind word the suffix names, or undefined. */
function kindOf(suffix: string): string | undefined {
  return wordsOf(suffix).find((word) => kinds.has(word));
}

function valueOf(suffix: string, kind: string | undefined): string {
  if (kind === undefined) return suffix;
  const rest = wordsOf(suffix)
    .filter((word) => word !== kind)
    .join('_');
  return rest === '' ? suffix : rest;
}

function discriminator(name: string, nullable: boolean): DraftColumn {
  return { name, type: 'varchar(100)', nullable, legacy: null, risk: '' };
}

/** The discriminator column name and the kind it names, or undefined when no name is free. */
function columnFor(others: readonly Member[], taken: ReadonlySet<string>) {
  const found = new Set(others.map(({ suffix }) => kindOf(suffix)));
  const only = found.size === 1 ? [...found][0] : undefined;
  const name = [only ?? unclear, unclear].find((each) => !taken.has(keyOf(each)));
  return name === undefined ? undefined : { name, kind: name === unclear ? undefined : only };
}

function biggest(group: readonly Member[]): Member {
  return group.reduce((best, each) =>
    each.table.columns.length > best.table.columns.length ? each : best,
  );
}

/** Ids can repeat across sites, so the discriminator joins the key (a table with a sheet of no suffix keeps its key). */
function keyed(column: string, key: readonly string[]): string[] {
  return key.length === 0 ? [] : [column, ...key];
}

function combined(stem: string, group: readonly Member[]) {
  const base = group.find(({ suffix }) => suffix === '');
  const taken = new Set(group.flatMap(({ table }) => [...columnKeys(table)]));
  const column = columnFor(
    group.filter(({ suffix }) => suffix !== ''),
    taken,
  );
  if (column === undefined) return undefined;
  const first = base ?? biggest(group);
  const { table: joined } = united(
    first.table,
    group.filter((each) => each !== first).map((each) => each.table),
  );
  const name = base?.table.name ?? stem;
  const values = group.map(({ table, suffix }) => ({
    sheet: table.name,
    value: suffix === '' ? null : valueOf(suffix, column.kind),
    sources: table.sources,
  }));
  const distinct = new Set(values.map((each) => each.value)).size === values.length;
  const listed = distinct
    ? values
    : values.map((each, at) => ({ ...each, value: group[at]?.suffix ?? each.value }));
  const table: DraftTable = {
    ...joined,
    name,
    columns: [...joined.columns, discriminator(column.name, base !== undefined)],
    primaryKey: base === undefined ? keyed(column.name, joined.primaryKey) : joined.primaryKey,
    primaryKey: base === undefined ? keyed(column.name, joined.primaryKey) : joined.primaryKey,
  };
  return { table, split: { table: name, column: column.name, values: listed } };
}

/** The stems of the names, longest first, that two tables or more share. */
function stemsOf(tables: readonly DraftTable[], tried: ReadonlySet<string>): string[] {
  const counts = new Map<string, number>();
  for (const table of tables) {
    const words = wordsOf(table.name);
    for (let at = 1; at <= words.length; at += 1) {
      const stem = words.slice(0, at).join('_');
      const last = words[at - 1] ?? '';
      if (stem.length >= minStem && !kinds.has(last) && !tried.has(stem))
        counts.set(stem, (counts.get(stem) ?? 0) + 1);
    }
  }
  return [...counts]
    .filter(([, count]) => count >= 2)
    .map(([stem]) => stem)
    .sort((a, b) => wordsOf(b).length - wordsOf(a).length || a.localeCompare(b));
}

function membersOf(stem: string, tables: readonly DraftTable[]): Member[] {
  const size = wordsOf(stem).length;
  return tables.flatMap((table) => {
    const words = wordsOf(table.name);
    if (words.slice(0, size).join('_') !== stem) return [];
    return [{ table, suffix: words.slice(size).join('_') }];
  });
}

// RF-623, P7-32
export function splitDrafts(drafts: readonly DraftTable[]): {
  readonly tables: DraftTable[];
  readonly splits: SplitTable[];
} {
  let pool = drafts.filter((table) => isIdentifier(table.name));
  const result = new Map<DraftTable, DraftTable>();
  const splits: SplitTable[] = [];
  const aliases = new Map<string, string>();
  const tried = new Set<string>();
  for (let stems = stemsOf(pool, tried); stems.length > 0; stems = stemsOf(pool, tried)) {
    const stem = stems[0] ?? '';
    tried.add(stem);
    const group = compatible(membersOf(stem, pool));
    const made = group.length >= 2 ? combined(stem, group) : undefined;
    if (made === undefined) continue;
    const used = new Set(group.map(({ table }) => table));
    pool = pool.filter((table) => !used.has(table));
    for (const each of used) result.set(each, made.table);
    for (const { table } of group) aliases.set(table.name, made.table.name);
    splits.push(made.split);
  }
  const written = new Set<DraftTable>();
  const tables = drafts.flatMap((table) => {
    const into = result.get(table);
    if (into === undefined) return [table];
    if (written.has(into)) return [];
    written.add(into);
    return [into];
  });
  return {
    tables: tables.map((table) => ({
      ...table,
      foreignKeys: table.foreignKeys.map((key) => repointed(key, aliases)),
    })),
    splits,
  };
}
