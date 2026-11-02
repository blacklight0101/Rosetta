import { costLabel } from './format.js';

// P7-26, RF-264: what "Write the overview" is estimated to cost. The call sends the run's cards
// (about 250 tokens each) and the prompt, and reads back at most the summariser's output; the price
// is the run's own average per token, so a local model reads as no cost.

const TOKENS_PER_CARD = 250;
const FIXED_TOKENS = 1_900;

/** The estimate in words, from the run's cards, tokens and cost. */
export function overviewEstimateText(run: {
  readonly cards: number;
  readonly tokens: number;
  readonly costMicros: number;
}): string {
  const tokens = run.cards * TOKENS_PER_CARD + FIXED_TOKENS;
  const micros = run.tokens > 0 ? Math.round((run.costMicros / run.tokens) * tokens) : 0;
  const cost = micros === 0 ? 'no cost' : `about ${costLabel(micros)}`;
  return `about ${tokens.toLocaleString('en-US')} tokens, ${cost}`;
}
