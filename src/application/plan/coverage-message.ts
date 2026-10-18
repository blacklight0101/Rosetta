import type { PlanTask } from '../../domain/planning/plan-content.js';
import type { CoverageItem } from '../../domain/planning/plan-coverage.js';

// RF-627 (stub; the implementation follows the tests).
export interface CoverageMessageInput {
  readonly tasks: readonly PlanTask[];
  readonly items: readonly CoverageItem[];
}

export function coverageMessage(input: CoverageMessageInput, tags: () => string): string {
  return input.tasks.length < 0 ? tags() : '';
}
