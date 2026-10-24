import type { ModelColumn, ModelTable, TargetDataModel } from '../../domain/planning/data-model.js';
import { unconfirmedType } from '../../domain/planning/data-model-names.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import { baseOf, databaseTypeNames } from './data-model-database.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, P5-37, ADR-013: the type, nullability and default of a column come from the supported
// `ENT` claim that states it, written `Column <Table>.<name>: <type>, NOT NULL|NULL[, default <value>]`
// (reader prompt area.v9). A column that differs from its claim goes back to the claim unless the
// planner wrote a reason for the change in the column's `risk`; a change that stays is listed in
// the model and in checks.md. A claim that is not in the form, and a column without a claim, are
// left as they are. The claim is untrusted text: it is cut to a bound and read by one flat pattern.

const MAX_CLAIM = 2000;
const MAX_FACTS = 50;

// One column fact. No part of the pattern can match what the next part matches, so reading is linear.
const factPattern =
  /Column\s+(?:[A-Za-z0-9_[\]]{1,64}\.)?([A-Za-z_][A-Za-z0-9_]{0,62}):\s*([A-Za-z][A-Za-z ]{0,38}(?:\(\d{1,5}(?:,\s?\d{1,3})?\))?),\s*(NOT NULL|NULL)(?:,\s*default\s+('[^']{0,40}'|[^\s,;]{1,40}))?/gu;

export interface ColumnFact {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  /** The default as written; empty for none. */
  readonly default: string;
}

/** The column facts a claim states; none for a claim not in the form. */
// RF-623
export function columnFactsOf(text: string): ColumnFact[] {
  const facts: ColumnFact[] = [];
  for (const match of text.slice(0, MAX_CLAIM).matchAll(factPattern)) {
    if (facts.length >= MAX_FACTS) break;
    const [, name = '', type = '', nulls = '', given = ''] = match;
    facts.push({
      ...{ name, type: type.trim(), nullable: nulls === 'NULL' },
      default: given.replace(/\.$/u, ''),
    });
  }
  return facts;
}

const plain = (name: string): string => name.toLowerCase().replace(/_/gu, '');
const squeezed = (type: string): string => type.toLowerCase().replace(/\s+/gu, '');

function factOf(column: ModelColumn, text: string): ColumnFact | undefined {
  if (column.legacy === null) return undefined;
  const names = [plain(column.legacy.field), plain(column.name)];
  return columnFactsOf(text).find((fact) => names.includes(plain(fact.name)));
}

function usable(type: string, database: string | null): boolean {
  const names = databaseTypeNames(database);
  return names === null || names.includes(baseOf(type));
}

interface Checked {
  readonly column: ModelColumn;
  readonly problems: string[];
}

function typeStep(column: ModelColumn, fact: ColumnFact, database: string | null): Checked {
  const same = column.type === unconfirmedType || squeezed(column.type) === squeezed(fact.type);
  if (same) return { column, problems: [] };
  const reasoned = column.migrationRisk !== '';
  if (!reasoned && usable(fact.type, database)) {
    return { column: { ...column, type: fact.type }, problems: [] };
  }
  const why = reasoned
    ? 'the model gives a reason'
    : 'the legacy type is not a type of the database';
  const problem = `The legacy type is ${fact.type} and the model uses ${column.type}; ${why}.`;
  const note = `The legacy type ${fact.type} is not a ${database ?? 'chosen'} type, so the column uses ${column.type}.`;
  return {
    column: reasoned ? column : { ...column, migrationRisk: note },
    problems: [problem],
  };
}

function nullStep(column: ModelColumn, fact: ColumnFact, reasoned: boolean): Checked {
  if (column.nullable === fact.nullable) return { column, problems: [] };
  if (!reasoned) return { column: { ...column, nullable: fact.nullable }, problems: [] };
  const was = fact.nullable ? 'nullable' : 'NOT NULL';
  return {
    column,
    problems: [`The legacy column is ${was} and the model's is not; the model gives a reason.`],
  };
}

function checkedColumn(column: ModelColumn, fact: ColumnFact, database: string | null): Checked {
  const typed = typeStep(column, fact, database);
  const nulls = nullStep(typed.column, fact, column.migrationRisk !== '');
  const kept = nulls.column;
  return {
    column: fact.default === '' ? kept : { ...kept, default: fact.default },
    problems: [...typed.problems, ...nulls.problems],
  };
}

function textsOf(cards: readonly SourceCard[]): ReadonlyMap<string, string> {
  return new Map(
    cards
      .filter((card) => card.type === 'ENT')
      .flatMap((card) => card.claims.filter((claim) => claim.status === 'Supported'))
      .map((claim) => [claim.claimId, claim.text]),
  );
}

/** The model with each column kept to its legacy claim, and the changes that stay, listed. */
// RF-623, P5-37
export function applyColumnFacts(
  model: TargetDataModel,
  cards: readonly SourceCard[],
): { readonly model: TargetDataModel; readonly problems: DataModelProblem[] } {
  const texts = textsOf(cards);
  const problems: DataModelProblem[] = [];
  const tableOf = (table: ModelTable): ModelTable => ({
    ...table,
    columns: table.columns.map((column) => {
      const fact = factOf(column, texts.get(column.legacy?.claimId ?? '') ?? '');
      if (fact === undefined) return column;
      const checked = checkedColumn(column, fact, model.database);
      problems.push(
        ...checked.problems.map((reason) => ({
          ...{ item: column.name, field: `table ${table.name} columns` },
          reason,
        })),
      );
      return checked.column;
    }),
  });
  return { model: { ...model, tables: model.tables.map(tableOf) }, problems };
}
