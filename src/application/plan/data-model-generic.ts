import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, P8-07, EV-31, EV-40: a small model names a table after the shape of the code (`x_entity`,
// `x_outputs`) and maps no column of the legacy data to it. The table stays, as the card behind it
// may still describe it, and checks.md lists it so the owner decides.

const generic = new Set(['entity', 'entities', 'output', 'outputs']);

/** The tables with a generic suffix for a name and no column that maps a legacy field. */
export function genericTables(model: TargetDataModel): DataModelProblem[] {
  return model.tables
    .filter((table) => {
      const parts = table.name.toLowerCase().split('_');
      const last = parts[parts.length - 1] ?? '';
      return (
        parts.length > 1 && generic.has(last) && table.columns.every((each) => each.legacy === null)
      );
    })
    .map((table) => ({
      item: table.name,
      field: `table ${table.name}`,
      reason: `The table name is a generic suffix (${table.name}) and no column maps a legacy field; confirm that the legacy data has this table, or drop it.`,
    }));
}
