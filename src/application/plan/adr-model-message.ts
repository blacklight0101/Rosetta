import { renderDataBlock } from '../../domain/egress/data-block.js';
import type { ModelTable } from '../../domain/planning/data-model.js';
import type { PlanDecision } from '../../domain/planning/plan-content.js';

// RF-623, P9-15, RF-145, ADR-013: what the planner is given to check the data model against the
// decision records. Two data blocks, each with its own fresh tag: the records that name a stored
// structure, and the tables of the target data model with the names of their columns. Both were
// written by models from the legacy code, so both are data; nothing of them is in the system prompt.

/** The longest text of a record sent; the check needs the decision, not an essay. */
const TEXT_CHARS = 1500;

export interface AdrModelMessageInput {
  readonly decisions: readonly Pick<
    PlanDecision,
    'id' | 'title' | 'context' | 'decision' | 'consequences'
  >[];
  readonly tables: readonly (Pick<ModelTable, 'name' | 'purpose'> & {
    readonly columns: readonly { readonly name: string }[];
  })[];
}

function decisionsText(decisions: AdrModelMessageInput['decisions']): string {
  const listed = decisions.map(({ id, title, context, decision, consequences }) => ({
    ...{ id, title, context: context.slice(0, TEXT_CHARS) },
    ...{ decision: decision.slice(0, TEXT_CHARS), consequences: consequences.slice(0, TEXT_CHARS) },
  }));
  return JSON.stringify({ decisions: listed }, null, 2);
}

function tablesText(tables: AdrModelMessageInput['tables']): string {
  const listed = tables.map(({ name, purpose, columns }) => ({
    ...{ name, purpose: purpose.slice(0, TEXT_CHARS) },
    columns: columns.map((column) => column.name),
  }));
  return JSON.stringify({ tables: listed }, null, 2);
}

/** The user message: the records block, then the tables block, each with a tag of its own. */
// RF-623, RF-145
export function adrModelMessage(input: AdrModelMessageInput, tags: () => string): string {
  const decisions = renderDataBlock(
    { source: 'cards', excerpts: [], text: decisionsText(input.decisions) },
    tags(),
  );
  const tables = renderDataBlock(
    { source: 'cards', excerpts: [], text: tablesText(input.tables) },
    tags(),
  );
  return `${decisions}\n\n${tables}`;
}
