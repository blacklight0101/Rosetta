import type { PlanContent } from './plan-content.js';
import type { CoverageItem } from './plan-coverage.js';
import type { DraftTask } from './plan-draft.js';

// Q-45: a stub until the next commit.

/** A task card the planner wrote for the items no card builds. */
export interface GapDraft extends Omit<DraftTask, 'needs'> {
  readonly builds: readonly string[];
}

export function addGapTasks(
  content: PlanContent,
  drafts: readonly GapDraft[],
  uncovered: readonly CoverageItem[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until the next commit
  options: { readonly specificationDriven?: boolean } = {},
): PlanContent {
  return content;
}
