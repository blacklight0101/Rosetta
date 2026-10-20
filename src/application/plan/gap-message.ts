import { renderDataBlock } from '../../domain/egress/data-block.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import type { CoverageItem } from '../../domain/planning/plan-coverage.js';

// Q-45, RF-627, RF-145, ADR-013: what the planner is given to write the task cards for the items no
// card builds. Two data blocks, each with its own fresh tag: the gaps by id with their kind, name
// and a detail line (and no item that has a card), and the plan they join: its phases, its
// requirements by position and the cards it already has by id and title. All of it was written by
// models from the legacy code, so all of it is data; nothing of it is in the system prompt.

/** The longest detail sent; the card needs a hint, not the whole text. */
const DETAIL_CHARS = 300;

export interface GapMessageInput {
  /** The items no task card builds. */
  readonly items: readonly CoverageItem[];
  readonly content: PlanContent;
}

function itemsText(items: readonly CoverageItem[]): string {
  const listed = items.map(({ id, kind, name, detail }) => ({
    ...{ id, kind, name, detail: detail.slice(0, DETAIL_CHARS) },
  }));
  return JSON.stringify({ items: listed }, null, 2);
}

function planText(content: PlanContent): string {
  const plan = {
    phases: content.phases.map(({ number, name, goal }) => ({ number, name, goal })),
    requirements: content.requirements.map(({ title }, index) => ({
      ...{ position: index + 1, title },
    })),
    tasks: content.tasks.map(({ id, title }) => ({ id, title })),
  };
  return JSON.stringify(plan, null, 2);
}

/** The user message: the gaps block, then the plan block, each with a tag of its own. */
// Q-45, RF-145
export function gapMessage(input: GapMessageInput, tags: () => string): string {
  const items = renderDataBlock(
    { source: 'cards', excerpts: [], text: itemsText(input.items) },
    tags(),
  );
  const plan = renderDataBlock(
    { source: 'owner_answers', excerpts: [], text: planText(input.content) },
    tags(),
  );
  return `${items}\n\n${plan}`;
}
