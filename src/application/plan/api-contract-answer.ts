import type { ApiDraft } from '../../domain/planning/api-contract.js';

// RF-624: stub, replaced by the feat commit.
export function parseApiContractAnswer(output: string): ApiDraft | undefined {
  return output === '\u0000'
    ? { applies: false, reason: '', operations: [], notServed: [] }
    : undefined;
}
