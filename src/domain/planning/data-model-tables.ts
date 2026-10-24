import { byCodeUnit } from '../code-map/code-unit-order.js';
import { isIdentifier, typeOrUnconfirmed } from './data-model-names.js';
import type {
  DraftColumn,
  DraftTable,
  ForeignKey,
  LeftOut,
  LegacyClaim,
  LegacySource,
  ModelColumn,
  ModelTable,
} from './data-model.js';

// RF-623, RF-603: the tables of the planner's draft checked one by one. A name must be an
// identifier and unique, a type a type name, a key or index must name columns the table has, a
// foreign key must point at a kept table and its kept columns, and a legacy source must be a
// supported ENT claim; what fails the check is left out (or, for a source, becomes "new") and
// counted, never repaired by guessing.

/** Mutable counters of what was left out; local to one assembly. */
export type Tally = { -readonly [K in keyof LeftOut]: number };

export function newTally(): Tally {
  return { tables: 0, columns: 0, keys: 0, sources: 0 };
}

export type ClaimIndex = ReadonlyMap<string, LegacyClaim>;

function legacyOf(column: DraftColumn, claims: ClaimIndex, tally: Tally): LegacySource | null {
  if (column.legacy === null) return null;
  const claim = claims.get(column.legacy.claim);
  if (claim === undefined) {
    tally.sources += 1;
    return null;
  }
  return { cardId: claim.cardId, claimId: claim.claimId, field: column.legacy.field };
}

function columnsOf(draft: DraftTable, claims: ClaimIndex, tally: Tally): ModelColumn[] {
  const seen = new Set<string>();
  const kept: ModelColumn[] = [];
  for (const column of draft.columns) {
    if (!isIdentifier(column.name) || seen.has(column.name)) {
      tally.columns += 1;
      continue;
    }
    seen.add(column.name);
    kept.push({
      ...{ name: column.name, type: typeOrUnconfirmed(column.type), nullable: column.nullable },
      legacy: legacyOf(column, claims, tally),
      migrationRisk: column.risk,
    });
  }
  return kept;
}

function allIn(names: ReadonlySet<string>, wanted: readonly string[]): boolean {
  return wanted.length > 0 && wanted.every((name) => names.has(name));
}

function keepWhere<T>(items: readonly T[], keep: (item: T) => boolean, tally: Tally): T[] {
  const kept = items.filter(keep);
  tally.keys += items.length - kept.length;
  return kept;
}

function primaryKeyOf(draft: DraftTable, names: ReadonlySet<string>, tally: Tally): string[] {
  if (draft.primaryKey.length === 0) return [];
  if (allIn(names, draft.primaryKey)) return [...new Set(draft.primaryKey)];
  tally.keys += 1;
  return [];
}

/** The ENT cards of the columns' sources and of the draft's own list, sorted. */
function sourcesOf(
  draft: DraftTable,
  columns: readonly ModelColumn[],
  claims: ClaimIndex,
): string[] {
  const known = new Set([...claims.values()].map((claim) => claim.cardId));
  const own = draft.sources.filter((id) => known.has(id));
  const mapped = columns.flatMap((column) =>
    column.legacy === null ? [] : [column.legacy.cardId],
  );
  return [...new Set([...own, ...mapped])].sort(byCodeUnit);
}

function tableOf(draft: DraftTable, claims: ClaimIndex, tally: Tally): ModelTable {
  const columns = columnsOf(draft, claims, tally);
  const names = new Set(columns.map((column) => column.name));
  return {
    ...{ name: draft.name, purpose: draft.purpose, columns, foreignKeys: [] },
    sources: sourcesOf(draft, columns, claims),
    primaryKey: primaryKeyOf(draft, names, tally),
    uniqueKeys: keepWhere(draft.uniqueKeys, (key) => allIn(names, key), tally),
    checks: draft.checks,
    indexes: keepWhere(draft.indexes, (index) => allIn(names, index.columns), tally),
    ...(draft.copiedFromLegacy === true ? { copiedFromLegacy: true } : {}),
  };
}

function foreignKeysOf(
  draft: DraftTable,
  own: ModelTable,
  tables: ReadonlyMap<string, ReadonlySet<string>>,
  tally: Tally,
): ForeignKey[] {
  const names = tables.get(own.name) ?? new Set<string>();
  return keepWhere(
    draft.foreignKeys,
    (key) => {
      const target = tables.get(key.references);
      return (
        allIn(names, key.columns) &&
        target !== undefined &&
        allIn(target, key.referencedColumns) &&
        key.columns.length === key.referencedColumns.length
      );
    },
    tally,
  );
}

/** The kept tables in the planner's order, each with the foreign keys that point at kept tables. */
// RF-623
export function checkedTables(
  drafts: readonly DraftTable[],
  claims: ClaimIndex,
  tally: Tally,
): ModelTable[] {
  const kept: { readonly draft: DraftTable; readonly table: ModelTable }[] = [];
  for (const draft of drafts) {
    if (!isIdentifier(draft.name) || kept.some(({ table }) => table.name === draft.name)) {
      tally.tables += 1;
      continue;
    }
    kept.push({ draft, table: tableOf(draft, claims, tally) });
  }
  const columnNames = new Map(
    kept.map(({ table }) => [table.name, new Set(table.columns.map((column) => column.name))]),
  );
  return kept.map(({ draft, table }) => ({
    ...table,
    foreignKeys: foreignKeysOf(draft, table, columnNames, tally),
  }));
}
