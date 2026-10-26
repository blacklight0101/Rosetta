import type { SourceCard } from '../../domain/planning/plan-sources.js';

// P5-38, RF-623, RF-604: the entities of the data model are asked in batches sized to the planner's
// output limit, so no single answer has to hold the whole model. The size of a table in the answer
// is worked out from its card (about what the claims state, each column a line of JSON); a model
// that thinks before it writes spends part of the limit before the first table, so a batch is
// sized to a share of the limit only. Pure, no model call.

/** The share of the output limit one batch's answer may take, in percent. */
const ANSWER_SHARE_PERCENT = 40;
/** The tokens of a table's frame: its name, purpose, keys and lists, whatever the claims say. */
const TABLE_FRAME_TOKENS = 250;
/** Answer tokens per token of claim text: a statement of columns becomes one JSON object each. */
const ANSWER_PER_CLAIM_TOKEN = 6;
const CHARS_PER_TOKEN = 4;

/** About how many answer tokens the table(s) of this card take. */
export function answerTokensOf(card: SourceCard): number {
  const chars = card.claims
    .filter((claim) => claim.status === 'Supported')
    .reduce((sum, claim) => sum + claim.text.length, 0);
  return TABLE_FRAME_TOKENS + Math.ceil((chars / CHARS_PER_TOKEN) * ANSWER_PER_CLAIM_TOKEN);
}

/** What one batch may take of the planner's output limit. */
export function batchBudget(maxOutputTokens: number): number {
  return Math.floor((maxOutputTokens * ANSWER_SHARE_PERCENT) / 100);
}

/** The `ENT` cards with a supported claim in card order, grouped so each group fits the budget; never empty groups. */
// P5-38
export function dataModelBatches(
  entities: readonly SourceCard[],
  maxOutputTokens: number,
): SourceCard[][] {
  const budget = batchBudget(maxOutputTokens);
  const batches: SourceCard[][] = [];
  let used = 0;
  for (const card of entities) {
    const tokens = answerTokensOf(card);
    const last = batches[batches.length - 1];
    if (last === undefined || used + tokens > budget) {
      batches.push([card]);
      used = tokens;
    } else {
      last.push(card);
      used += tokens;
    }
  }
  return batches;
}
