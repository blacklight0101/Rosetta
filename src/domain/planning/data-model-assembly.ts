import type { DataModelAssembly, DataModelDraft, LegacyClaim } from './data-model.js';

// RF-623: stub, written with the tests.
export function assembleDataModel(
  draft: DataModelDraft,
  legacy: readonly LegacyClaim[],
  database: string | null,
): DataModelAssembly {
  const tables = draft.tables.length < 0 ? legacy.length : 0;
  return {
    model: { database, tables: [], dropped: [] },
    leftOut: { tables, columns: 0, keys: 0, sources: 0 },
  };
}
