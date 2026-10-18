import { renderDataBlock } from '../../domain/egress/data-block.js';
import type { PlanTask } from '../../domain/planning/plan-content.js';
import type { CoverageItem } from '../../domain/planning/plan-coverage.js';

// RF-627, RF-145, ADR-013: what the planner is given to link the task cards to the items they
// build. Two data blocks, each with its own fresh tag: the task cards by position with their
// title and Given/When/Then criteria, and the items by id with their kind, name and a detail line.
// Both were written by models from the legacy code, so both are data; nothing of them is in the
// system prompt.

/** The longest detail sent; the link needs a hint, not the whole text. */
const DETAIL_CHARS = 300;

export interface CoverageMessageInput {
  readonly tasks: readonly PlanTask[];
  readonly items: readonly CoverageItem[];
}

function tasksText(tasks: readonly PlanTask[]): string {
  const listed = tasks.map(({ title, acceptanceCriteria }, index) => ({
    ...{ position: index + 1, title, acceptanceCriteria },
  }));
  return JSON.stringify({ tasks: listed }, null, 2);
}

function itemsText(items: readonly CoverageItem[]): string {
  const listed = items.map(({ id, kind, name, detail }) => ({
    ...{ id, kind, name, detail: detail.slice(0, DETAIL_CHARS) },
  }));
  return JSON.stringify({ items: listed }, null, 2);
}

/** The user message: the tasks block, then the items block, each with a tag of its own. */
// RF-627, RF-145
export function coverageMessage(input: CoverageMessageInput, tags: () => string): string {
  const tasks = renderDataBlock(
    { source: 'owner_answers', excerpts: [], text: tasksText(input.tasks) },
    tags(),
  );
  const items = renderDataBlock(
    { source: 'cards', excerpts: [], text: itemsText(input.items) },
    tags(),
  );
  return `${tasks}\n\n${items}`;
}
