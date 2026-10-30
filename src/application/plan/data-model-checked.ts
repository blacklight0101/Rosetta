import type { DataModelAssembly, MergedTable } from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { DataModelProblem } from './data-model-answer.js';
import { applyColumnFacts } from './data-model-column-facts.js';
import { typeProblems, withCanonicalTypes } from './data-model-database.js';
import { fitLengths, unconfirmedTypes } from './data-model-type-fit.js';
import { keepLegacyKeys } from './data-model-legacy-keys.js';
import { missingNamed } from './data-model-named.js';

// RF-623, P3-120, P5-38, P7-13: the model once the planner's draft is assembled: the legacy keys
// kept, the columns held to their legacy claims, the types under the one name of the database, and
// what the checks flag. Everything flagged is about a part the model keeps, so each is a `check`
// (checks.md "Data model"), never a row of "Left out", which lists only what the model dropped.

const copiedReason =
  'The planner answer for this table failed after a retry, so its names, columns, types and keys are copied from the legacy claims; confirm them.';

function mergeNote(merge: MergedTable): DataModelProblem {
  const names = merge.merged.join(', ');
  const twins =
    merge.columns === undefined
      ? ''
      : ` Columns with the same name apart from case or separators were united: ${merge.columns.join(', ')}.`;
  const reason = `Tables whose names differ only by plural, case or separators were merged into this one: ${names}.${twins}`;
  return { item: merge.kept, field: `table ${merge.kept}`, reason };
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
        ...copied.map((item) => ({ item, field: `table ${item}`, reason: copiedReason })),
        ...assembled.merged.map(mergeNote),
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
