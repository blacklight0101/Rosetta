import type { PlanContent } from '../../domain/planning/plan-content.js';
import type { CoverageItem } from '../../domain/planning/plan-coverage.js';

// Q-45: a stub until the next commit.

export interface GapMessageInput {
  readonly items: readonly CoverageItem[];
  readonly content: PlanContent;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until the next commit
export function gapMessage(input: GapMessageInput, tags: () => string): string {
  return '';
}
