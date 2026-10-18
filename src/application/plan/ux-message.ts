import { formatCitation } from '../../domain/cards/citation.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-626, RF-145, ADR-013: what the planner is given to plan the screens. Two data blocks, each
// with its own fresh tag: the verified `SCRN` cards with their route, roles, fields, actions and
// links and only their `Supported` claims (each with its claim id and citations), and the owner's
// front end and architecture style. Both blocks are data; nothing of them is in the system prompt.

export interface UxMessageInput {
  /** The verified `SCRN` cards with their supported claims. */
  readonly screenCards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

function cardsText(cards: readonly SourceCard[]): string {
  const screenCards = cards.map(({ id, title, summary, screen, claims }) => ({
    ...{ id, title, summary },
    screen: screen ?? null,
    claims: claims
      .filter((claim) => claim.status === 'Supported')
      .map(({ claimId, text, citations }) => ({
        ...{ claimId, text },
        citations: citations.map(formatCitation),
      })),
  }));
  return JSON.stringify({ screenCards }, null, 2);
}

function ownerText(brief: PlanningBrief): string {
  const frontEnd = brief.stack.find((entry) => entry.layer === 'front-end')?.choice ?? null;
  return JSON.stringify(
    { targetStack: { frontEnd }, architectureStyle: brief.architecture.style },
    null,
    2,
  );
}

/** The user message: the cards block, then the owner's block, each with a tag of its own. */
// RF-626, RF-145
export function uxMessage(input: UxMessageInput, tags: () => string): string {
  const cards = renderDataBlock(
    { source: 'cards', excerpts: [], text: cardsText(input.screenCards) },
    tags(),
  );
  const owner = renderDataBlock(
    { source: 'owner_answers', excerpts: [], text: ownerText(input.brief) },
    tags(),
  );
  return `${cards}\n\n${owner}`;
}
