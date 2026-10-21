import type { Card } from '../../domain/cards/card.js';
import { MERGEABLE_TYPES } from '../../domain/cards/card-merge.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';

// RF-250, RF-145, RF-425, P2-35, Q-52: what the summariser is asked and what it is given. It is asked
// about a type once two reader tasks wrote cards of it, in two areas or in one, in one run or in
// the rounds of a Deepen (a duplicate needs two writers; one task's own cards are not compared); it sees
// only the cards of that type, as text inside one data block, never the code. The cards of a type
// are shown in batches of at most `MERGE_BATCH_TOKENS`, one call each, so a large run never sends a
// message that is larger than a model can read; the estimate counts the same batches.

/** The most tokens of cards one summariser call is shown (about four characters per token). */
export const MERGE_BATCH_TOKENS = 8000;
/** The merge prompt every call resends, for the estimate (`prompts/summariser/merge.v2.md`). */
export const MERGE_PROMPT_TOKENS = 800;
/** The most a call's list of merges is expected to take, for the estimate. */
export const MERGE_ANSWER_TOKENS = 500;

const CHARS_PER_TOKEN = 4;

/** The types, in the order they are asked, that have cards from at least two reader tasks. */
// RF-250
export function typesToMerge(cards: readonly Card[]): readonly CardType[] {
  return MERGEABLE_TYPES.filter((type) => {
    const tasks = cards.filter((card) => card.type === type).map((card) => card.agentTaskId);
    return new Set(tasks).size >= 2;
  });
}

function listedOf({ id, area, title, summary, claims }: Card) {
  return { id, area, title, summary, claims: claims.map((claim) => claim.text) };
}

function tokensOf(card: Card): number {
  return Math.ceil(JSON.stringify(listedOf(card), null, 2).length / CHARS_PER_TOKEN);
}

/**
 * The cards of one type cut, in card order, into the batches one call each is shown: as many cards
 * as fit in `limit` tokens (a card larger than the limit is a batch of its own). A batch of one
 * card is left out: it has nothing to be merged with.
 */
// RF-250
export function mergeBatches(
  cards: readonly Card[],
  type: CardType,
  limit: number = MERGE_BATCH_TOKENS,
): readonly (readonly Card[])[] {
  const batches: Card[][] = [];
  let used = 0;
  for (const card of cards.filter((each) => each.type === type)) {
    const size = tokensOf(card);
    const last = batches.at(-1);
    if (last === undefined || used + size > limit) {
      batches.push([card]);
      used = size;
    } else {
      last.push(card);
      used += size;
    }
  }
  return batches.filter((batch) => batch.length >= 2);
}

/** The user message: the cards of one type as one data block with its own tag. */
export function mergeMessage(cards: readonly Card[], type: CardType, tag: string): string {
  const listed = cards.filter((card) => card.type === type).map(listedOf);
  return renderDataBlock(
    { source: 'cards', excerpts: [], text: JSON.stringify(listed, null, 2) },
    tag,
  );
}
