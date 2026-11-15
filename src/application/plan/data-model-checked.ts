import type {
  DataModelAssembly,
  MergedTable,
  SplitTable,
} from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { DataModelProblem } from './data-model-answer.js';
import { applyColumnFacts } from './data-model-column-facts.js';
import { typeProblems, withCanonicalTypes } from './data-model-database.js';
import { fitLengths, unconfirmedTypes } from './data-model-type-fit.js';
import { keepLegacyKeys } from './data-model-legacy-keys.js';
import { genericTables } from './data-model-generic.js';
import { missingNamed } from './data-model-named.js';

// RF-623, P3-120, P5-38, P7-13: the model once the planner's draft is assembled: the legacy keys
// kept, the columns held to their legacy claims, the types under the one name of the database, and
// what the checks flag. Everything flagged is about a part the model keeps, so each is a `check`
// (checks.md "Data model"), never a row of "Left out", which lists only what the model dropped.

const copiedReason =
  'The planner answer for this table failed after a retry, so its names, columns, types and keys are copied from the legacy claims; confirm them.';

const reasonedReason =
  'The planner found no stored data in the cards of this table, so it is named after them or copied from the legacy claims; confirm that the new system needs it.';

function mergeNote(merge: MergedTable): DataModelProblem {
  const names = merge.merged.join(', ');
  const twins =
    merge.columns === undefined
      ? ''
      : ` Columns with the same name apart from case or separators were united: ${merge.columns.join(', ')}.`;
  const reason = `Tables whose names differ only by plural, case or separators were merged into this one: ${names}.${twins}`;
  return { item: merge.kept, field: `table ${merge.kept}`, reason };
}

// P7-32
function splitNote(split: SplitTable): DataModelProblem {
  const listed = split.values.map((each) => `${each.sheet} = ${each.value ?? 'base'}`).join(', ');
  const reason = `Sheets with the same columns, one per site or copy, were made one table with the column ${split.column}; the data migration fills it from the sheet: ${listed}. The same id may repeat across sheets, so the key includes ${split.column}. A sheet with no suffix gets the value base, so the column is never empty and the primary key works on every database.`;
  return { item: split.table, field: `table ${split.table}`, reason };
}

/** The model, whether it has a table, what the checks flag (all of kind `check`) and the tables copied. */
export interface CheckedModel {
  readonly assembly: DataModelAssembly;
  readonly readable: boolean;
  readonly flagged: readonly DataModelProblem[];
  readonly copied: readonly string[];
}

// RF-623, P3-120
export function checkedModel(
  assembled: DataModelAssembly,
  cards: readonly SourceCard[],
  brief: PlanningBrief,
  reasoned = false,
): CheckedModel {
  const keys = keepLegacyKeys(assembled.model, cards, brief);
  const facts = applyColumnFacts(keys.model, cards);
  const fitted = fitLengths(facts.model, cards);
  const model = withCanonicalTypes(fitted.model);
  const assembly = { ...assembled, model };
  const readable = model.tables.length > 0;
  const copied = model.tables
    .filter((table) => table.copiedFromLegacy === true)
    .map((table) => table.name);
  const found = readable
    ? [
        ...copied.map((item) => ({
          item,
          field: `table ${item}`,
          reason: reasoned ? reasonedReason : copiedReason,
        })),
        ...assembled.merged.map(mergeNote),
        ...(model.splits ?? []).map(splitNote),
        ...genericTables(model),
        ...typeProblems(model),
        ...keys.problems,
        ...facts.problems,
        ...fitted.problems,
        ...unconfirmedTypes(model),
        ...missingNamed(model, cards),
      ]
    : [];
  return { assembly, readable, copied, flagged: found.map((each) => ({ ...each, kind: 'check' })) };
}

const tableColumns = /^table (\S+) columns(?: \d+)?$/u;
const copyReason =
  'A malformed copy of this column in the planner answer was ignored; the model keeps the column.';

/**
 * The parser's dropped parts, with a row about a column the model keeps (after the merge) made a
 * check, so "Left out" never lists a column that is still in the model (P7-13, EV-74).
 */
// RF-627
export function withoutKeptLeftOut(
  problems: readonly DataModelProblem[],
  assembly: DataModelAssembly,
): DataModelProblem[] {
  const merged = new Map(
    assembly.merged.flatMap((each) => each.merged.map((name) => [name, each.kept])),
  );
  return problems.map((problem) => {
    const named = tableColumns.exec(problem.field)?.[1];
    if (problem.kind !== undefined || named === undefined) return problem;
    const table = assembly.model.tables.find((each) => each.name === (merged.get(named) ?? named));
    const kept = table?.columns.some((column) => column.name === problem.item) === true;
    return kept ? { ...problem, kind: 'check', reason: copyReason } : problem;
  });
}

/** The warning about the tables kept only because the model is never empty (P5-38, RF-623, P10-08). */
export function copiedWarnings(planned: {
  readonly copied: readonly string[];
  readonly reasoned?: boolean | undefined;
  readonly cutOffNote: string;
}): string[] {
  const { copied, reasoned, cutOffNote } = planned;
  const count = String(copied.length);
  if (copied.length === 0) return [];
  if (reasoned === true) {
    return [
      `The planner found no stored data in the cards of ${count} table(s); they are named after the cards or copied from the legacy claims and marked, to confirm: ${copied.join(', ')}.`,
    ];
  }
  const cut = cutOffNote === '' ? '' : ` ${cutOffNote}`;
  return [
    `The planner answer for ${count} table(s) failed after a retry; they are copied from the legacy claims and marked: ${copied.join(', ')}.${cut}`,
  ];
}
