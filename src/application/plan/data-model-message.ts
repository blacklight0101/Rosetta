import { formatCitation } from '../../domain/cards/citation.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import { omittedSummary } from './plan-packing.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-623, RF-145, ADR-013: what the planner is given to write the data model. Two data blocks, each
// with its own fresh tag: the `ENT` cards with only their `Supported` claims, each with its claim
// id (so the planner can name the legacy field a column comes from) and citations, and the owner's database choice and data migration note.
// Both blocks are data; nothing of them is in the system prompt.

export interface DataModelMessageInput {
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
  /** P3-113: the ids of the `ENT` cards the prompt names by title only, to fit the planner's window. */
  readonly omitted?: ReadonlySet<string>;
}

function cardsText(input: DataModelMessageInput): string {
  const omitted = input.omitted ?? new Set<string>();
  const entities = input.cards.filter((card) => card.type === 'ENT');
  const entityCards = entities
    .filter((card) => !omitted.has(card.id))
    .map(({ id, title, summary, claims }) => ({
      ...{ id, title, summary },
      claims: claims
        .filter((claim) => claim.status === 'Supported')
        .map(({ claimId, text, citations }) => ({
          ...{ claimId, text },
          citations: citations.map(formatCitation),
        })),
    }));
  const json = JSON.stringify({ entityCards }, null, 2);
  const summary = omittedSummary(entities.filter((card) => omitted.has(card.id)));
  return summary === ''
    ? json
    : `${json}

${summary}`;
}

function ownerText(brief: PlanningBrief): string {
  const choice = (layer: string): string | null =>
    brief.stack.find((entry) => entry.layer === layer)?.choice ?? null;
  return JSON.stringify(
    {
      targetStack: { database: choice('database'), dataAccess: choice('data-access') },
      dataMigration: brief.context.dataMigration,
    },
    null,
    2,
  );
}

/** The user message: the cards block, then the owner's block, each with a tag of its own. */
// RF-623, RF-145
export function dataModelMessage(input: DataModelMessageInput, tags: () => string): string {
  const cards = renderDataBlock({ source: 'cards', excerpts: [], text: cardsText(input) }, tags());
  const owner = renderDataBlock(
    { source: 'owner_answers', excerpts: [], text: ownerText(input.brief) },
    tags(),
  );
  return `${cards}\n\n${owner}`;
}
