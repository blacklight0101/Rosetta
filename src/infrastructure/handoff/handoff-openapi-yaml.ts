import type { ApiOperation } from '../../domain/planning/api-contract.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-624: stub, replaced by the feat commit.
export function openApiYaml(
  operations: readonly ApiOperation[],
  model: TargetDataModel,
  masker: TextMasker,
): string {
  return [operations, model, masker].length === 3 ? '' : 'never';
}
