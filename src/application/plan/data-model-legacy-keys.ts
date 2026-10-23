import type { ModelColumn, ModelTable, TargetDataModel } from '../../domain/planning/data-model.js';
import { unconfirmedType } from '../../domain/planning/data-model-names.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, P3-120: a key the legacy SQL shows as an integer stays an integer unless the brief asks
// otherwise. The legacy key type is read from the supported claims of the table's own `ENT` cards
// (a SQL string or a table description such as `tblOrders(id int, ...)`). A primary-key column of
// another type is listed in checks.md and gets a migration note in the model (the planner's own
// note is kept when it wrote one).

const integerType = /^(?:tinyint|smallint|int|integer|bigint|int2|int4|int8|serial|bigserial)\b/u;
const integerWord = '(?:int|integer|bigint|smallint|tinyint)';

function escaped(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** True when a claim shows one of the names as an integer. */
function showsInteger(names: readonly string[], texts: readonly string[]): boolean {
  const alternatives = names.map(escaped).join('|');
  const pattern = new RegExp(`\\b(?:${alternatives})\\b[\\]"]?\\s*\\(?\\s*${integerWord}\\b`, 'iu');
  return texts.some((text) => pattern.test(text));
}

function asksFor(brief: PlanningBrief, type: string): boolean {
  const base = type.toLowerCase().replace(/\(.*$/u, '').trim();
  return (brief.context.dataMigration ?? '').toLowerCase().includes(base);
}

interface Change {
  readonly column: ModelColumn;
  readonly asked: boolean;
}

function changedKeys(table: ModelTable, texts: readonly string[], brief: PlanningBrief): Change[] {
  return table.columns.flatMap((column) => {
    if (!table.primaryKey.includes(column.name)) return [];
    if (integerType.test(column.type.toLowerCase()) || column.type === unconfirmedType) return [];
    const names = [column.name, ...(column.legacy === null ? [] : [column.legacy.field])];
    if (!showsInteger(names, texts)) return [];
    return [{ column, asked: asksFor(brief, column.type) }];
  });
}

function noteOf(type: string): string {
  return `The legacy key is an integer; the new key type ${type} needs a migration that maps each old id to a new one.`;
}

function problemOf(table: ModelTable, change: Change): DataModelProblem {
  const how = change.asked
    ? 'the brief asks for the change, so a migration note is written'
    : 'the brief does not ask for a new key type, so keep the integer key or plan the migration';
  return {
    item: change.column.name,
    field: `table ${table.name} columns`,
    reason: `The legacy key is an integer and the model uses ${change.column.type}; ${how}.`,
  };
}

function supportedTexts(cards: readonly SourceCard[], ids: readonly string[]): string[] {
  return cards
    .filter((card) => ids.includes(card.id))
    .flatMap((card) => card.claims.filter((each) => each.status === 'Supported'))
    .map((claim) => claim.text);
}

/** The model with a migration note on every changed legacy key, and the changes listed. */
// RF-623, P3-120
export function keepLegacyKeys(
  model: TargetDataModel,
  cards: readonly SourceCard[],
  brief: PlanningBrief,
): { readonly model: TargetDataModel; readonly problems: DataModelProblem[] } {
  const problems: DataModelProblem[] = [];
  const tables = model.tables.map((table) => {
    const changes = changedKeys(table, supportedTexts(cards, table.sources), brief);
    if (changes.length === 0) return table;
    problems.push(...changes.map((change) => problemOf(table, change)));
    const changed = new Set(changes.map((change) => change.column.name));
    const columns = table.columns.map((column) =>
      changed.has(column.name) && column.migrationRisk === ''
        ? { ...column, migrationRisk: noteOf(column.type) }
        : column,
    );
    return { ...table, columns };
  });
  return { model: { ...model, tables }, problems };
}
