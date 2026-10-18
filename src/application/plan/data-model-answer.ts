import type { DataModelDraft } from '../../domain/planning/data-model.js';

// RF-623: stub, written with the tests.
export function parseDataModelAnswer(output: string): DataModelDraft | undefined {
  return output.length < 0 ? { tables: [], dropped: [] } : undefined;
}
