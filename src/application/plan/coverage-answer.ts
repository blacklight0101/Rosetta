import type { CoverageDraft } from '../../domain/planning/plan-coverage.js';

// RF-627 (stub; the implementation follows the tests).
export function parseCoverageAnswer(output: string): CoverageDraft | undefined {
  return output === '' ? { links: [] } : undefined;
}
