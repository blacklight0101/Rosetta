import type { Card } from '../../domain/cards/card.js';
import { MERGEABLE_TYPES } from '../../domain/cards/card-merge.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';

// RF-250, RF-145: what the summariser is asked and what it is given. It is asked about a type only
// when two areas wrote cards of it (a duplicate across areas needs two); it sees only the cards of
// that type, as text inside one data block, never the code.

/** The types, in the order they are asked, that have cards from at least two areas. */
export function typesToMerge(cards: readonly Card[]): readonly CardType[] {
  return MERGEABLE_TYPES.filter((type) => {
    const areas = cards.filter((card) => card.type === type).map((card) => card.area);
    return new Set(areas).size >= 2;
  });
}

/** The user message: the cards of one type as one data block with its own tag. */
export function mergeMessage(cards: readonly Card[], type: CardType, tag: string): string {
  const listed = cards
    .filter((card) => card.type === type)
    .map(({ id, area, title, summary, claims }) => ({
      id,
      area,
      title,
      summary,
      claims: claims.map((claim) => claim.text),
    }));
  return renderDataBlock(
    { source: 'cards', excerpts: [], text: JSON.stringify(listed, null, 2) },
    tag,
  );
}

// STUB (red commit): replaced in the next commit.
export const MERGE_BATCH_TOKENS = 8000;
export const MERGE_PROMPT_TOKENS = 1000;
export const MERGE_ANSWER_TOKENS = 500;

export function mergeBatches(
  cards: readonly Card[],
  type: CardType,
  limit: number = MERGE_BATCH_TOKENS,
): readonly (readonly Card[])[] {
  return limit < 0 ? [] : [cards.filter((card) => card.type === type)];
}
