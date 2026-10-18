import type { TargetDataModel } from '../planning/data-model.js';

// RF-623: stub, written with the tests.
export function targetModelDiagram(model: TargetDataModel, mask: (text: string) => string): string {
  return model.tables.length < 0 ? mask('') : '';
}
