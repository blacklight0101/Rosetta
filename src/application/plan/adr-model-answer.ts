import type { AdrModelDraft } from '../../domain/planning/adr-model-check.js';

// RF-623, P9-15: stub.
export function parseAdrModelAnswer(output: string): AdrModelDraft | undefined {
  return output === '' ? { missing: [] } : undefined;
}
