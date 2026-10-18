import { emptyPrd, type PrdContent } from '../../domain/planning/prd-content.js';

// RF-621 (stub, replaced by the implementation).
export function parsePrdAnswer(output: string): PrdContent | undefined {
  return output === '' ? emptyPrd : undefined;
}
