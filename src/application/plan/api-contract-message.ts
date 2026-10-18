import { formatCitation } from '../../domain/cards/citation.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import { servableCards } from '../../domain/planning/api-contract.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-624, RF-145, ADR-013: what the planner is given to write the API contract. Two data blocks, each
// with its own fresh tag: the verified `FEAT` and `FLOW` cards with only their `Supported` claims (each
// with its claim id and citations) and the `ENT` cards by id, title and summary (so an operation can
// name the entity whose table is its body), and the owner's front end, back end and database choices.
// Both blocks are data; nothing of them is in the system prompt. The message does not carry the
// data model, so the plan estimate can measure it before the run (RF-613).

export interface ApiContractMessageInput {
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

function cardsText(cards: readonly SourceCard[]): string {
  const features = servableCards(cards).map(({ id, type, title, summary, claims }) => ({
    ...{ id, type, title, summary },
    claims: claims
      .filter((claim) => claim.status === 'Supported')
      .map(({ claimId, text, citations }) => ({
        ...{ claimId, text },
        citations: citations.map(formatCitation),
      })),
  }));
  const entities = cards
    .filter((card) => card.type === 'ENT')
    .map(({ id, title, summary }) => ({ id, title, summary }));
  return JSON.stringify({ featureAndFlowCards: features, entityCards: entities }, null, 2);
}

function ownerText(brief: PlanningBrief): string {
  const choice = (layer: string): string | null =>
    brief.stack.find((entry) => entry.layer === layer)?.choice ?? null;
  const targetStack = {
    frontEnd: choice('front-end'),
    backEnd: choice('backend-framework'),
    database: choice('database'),
  };
  return JSON.stringify({ targetStack, architectureStyle: brief.architecture.style }, null, 2);
}

/** The user message: the cards block, then the owner's block, each with a tag of its own. */
// RF-624, RF-145
export function apiContractMessage(input: ApiContractMessageInput, tags: () => string): string {
  const cards = renderDataBlock(
    { source: 'cards', excerpts: [], text: cardsText(input.cards) },
    tags(),
  );
  const owner = renderDataBlock(
    { source: 'owner_answers', excerpts: [], text: ownerText(input.brief) },
    tags(),
  );
  return `${cards}\n\n${owner}`;
}
