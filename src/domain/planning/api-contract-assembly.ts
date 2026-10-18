import type { ApiAssembly, ApiDraft } from './api-contract.js';
import type { TargetDataModel } from './data-model.js';

// RF-624: stub, replaced by the feat commit.
export function assembleApiContract(
  draft: ApiDraft | undefined,
  servable: readonly string[],
  model: TargetDataModel,
): ApiAssembly {
  const none = [draft, servable, model].length - 3;
  return {
    contract: { kind: 'none', reason: '' },
    readable: false,
    leftOut: { operations: none, serves: none, security: none },
  };
}
