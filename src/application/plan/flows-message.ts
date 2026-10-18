import { formatCitation } from '../../domain/cards/citation.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import type { DraftComponent } from '../../domain/planning/plan-draft.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';

// RF-625, RF-145, ADR-013: what the planner is given to map the target flows. Two data blocks, each
// with its own fresh tag: the verified `FLOW` cards with only their `Supported` steps, each with its
// claim id (so the planner can name the step it maps), the card the step touches and its
// citations, and the target architecture: the components the plan named, which the plan's own
// answer wrote and so are data too. Both blocks are data; nothing of them is in the system prompt.

/** The longest responsibility sent; the mapping needs a name and a hint, not the whole text. */
export const RESPONSIBILITY_CHARS = 300;

export interface FlowsMessageInput {
  /** The verified `FLOW` cards. */
  readonly flowCards: readonly SourceCard[];
  /** All the supported cards, so a step can name the card it touches. */
  readonly cards: readonly SourceCard[];
  readonly components: readonly DraftComponent[];
}

function flowsText(input: FlowsMessageInput): string {
  const known = new Set(input.cards.map((card) => card.id));
  const flows = input.flowCards.map(({ id, title, summary, flow, claims }) => ({
    ...{ id, title, summary },
    trigger: flow?.trigger ?? null,
    outcome: flow?.outcome ?? null,
    steps: claims.map(({ claimId, text, target, citations }) => ({
      ...{ claimId, text },
      touches: target !== undefined && known.has(target) ? target : null,
      citations: citations.map(formatCitation),
    })),
  }));
  return JSON.stringify({ flowCards: flows }, null, 2);
}

function architectureText(components: readonly DraftComponent[]): string {
  return JSON.stringify(
    {
      components: components.map(({ name, responsibility }) => ({
        name,
        responsibility: responsibility.slice(0, RESPONSIBILITY_CHARS),
      })),
    },
    null,
    2,
  );
}

/** The user message: the flows block, then the architecture block, each with a tag of its own. */
// RF-625, RF-145
export function flowsMessage(input: FlowsMessageInput, tags: () => string): string {
  const flows = renderDataBlock({ source: 'cards', excerpts: [], text: flowsText(input) }, tags());
  const architecture = renderDataBlock(
    { source: 'owner_answers', excerpts: [], text: architectureText(input.components) },
    tags(),
  );
  return `${flows}\n\n${architecture}`;
}
