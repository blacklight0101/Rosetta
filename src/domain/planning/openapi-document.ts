import type { ApiOperation } from './api-contract.js';
import type { TargetDataModel } from './data-model.js';

// RF-624: stub, replaced by the feat commit.
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | Readonly<Record<string, JsonValue>>;

export function openApiDocument(
  operations: readonly ApiOperation[],
  model: TargetDataModel,
  mask: (text: string) => string,
): Readonly<Record<string, JsonValue>> {
  return [operations, model, mask].length === 3 ? {} : { never: null };
}
