import { formatCitation } from '../../domain/cards/citation.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import { databaseTypeNames } from './data-model-database.js';
import { ruleCandidates } from './data-model-named.js';
import { omittedSummary } from './plan-packing.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-623, RF-145, ADR-013: what the planner is given to write the data model. Two data blocks, each
// with its own fresh tag: the `ENT` cards with only their `Supported` claims, each with its claim
// id (so the planner can name the legacy field a column comes from) and citations, with the claims of
// the rule and requirement cards (P3-120: the columns and tables they name), and the owner's database
// choice with its type names (null for a database the code does not know) and data migration note.
// Both blocks are data; nothing of them is in the system prompt.

export interface DataModelMessageInput {
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
  /** P3-113: the ids of the `ENT` and rule cards the prompt names by title only, to fit the planner's window. */
  readonly omitted?: ReadonlySet<string>;
  /** P5-38: the `ENT` cards this call writes tables for; the others are named, and another call writes them. */
  readonly batch?: readonly SourceCard[] | undefined;
}

function cardsText(input: DataModelMessageInput): string {
  const omitted = input.omitted ?? new Set<string>();
  const all = input.cards.filter((card) => card.type === 'ENT');
  const inBatch = new Set((input.batch ?? all).map((card) => card.id));
  const entities = all.filter((card) => inBatch.has(card.id));
  const otherEntities = all
    .filter((card) => !inBatch.has(card.id))
    .map(({ id, title }) => ({ id, title }));
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
  const rules = ruleCandidates(input.cards);
  const ruleCards = rules
    .filter((card) => !omitted.has(card.id))
    .map(({ id, title, claims }) => ({
      ...{ id, title },
      claims: claims.map(({ claimId, text }) => ({ claimId, text })),
    }));
  const shown =
    input.batch === undefined
      ? { entityCards, ruleCards }
      : { entityCards, otherEntities, ruleCards };
  const json = JSON.stringify(shown, null, 2);
  const summary = omittedSummary([...entities, ...rules].filter((card) => omitted.has(card.id)));
  return summary === ''
    ? json
    : `${json}

${summary}`;
}

/** P3-113, P3-120: the cards the data-model prompt may name by title only: the entities and the rule cards it sends. */
export function packableCards(
  cards: readonly SourceCard[],
  batch?: readonly SourceCard[],
): SourceCard[] {
  return [...(batch ?? cards.filter((card) => card.type === 'ENT')), ...ruleCandidates(cards)];
}

function ownerText(brief: PlanningBrief): string {
  const choice = (layer: string): string | null =>
    brief.stack.find((entry) => entry.layer === layer)?.choice ?? null;
  return JSON.stringify(
    {
      targetStack: {
        ...{ database: choice('database'), dataAccess: choice('data-access') },
        databaseTypes: databaseTypeNames(choice('database')),
      },
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
