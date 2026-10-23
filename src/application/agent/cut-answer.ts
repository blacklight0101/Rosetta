import { searchJson } from '../cards/extract-json.js';
import type { CardParse } from '../cards/parse-cards.js';
import type { FinishReason } from '../ports/llm-provider.js';

// P5-03, RF-208, Q-55: what a reader answer that stopped on the output limit is, and how its
// continuation is joined. The collector asks the questions here and nothing else, so a later rule
// about the shape of an answer (P5-14: code fences, a missing object) changes this file only.

/** An answer and why the model stopped writing it. */
export interface AnswerText {
  readonly text: string;
  readonly finishReason: Exclude<FinishReason, 'error'>;
}

/**
 * Whether the answer was cut off at the output limit and so should be continued. The provider's
 * stop reason (`length`) decides when it is known: the answer is cut unless it parsed whole.
 * Without it, the text decides: JSON that was started and never closed (the parser's `cutOff`).
 */
// RF-208, Q-55
export function isCutAnswer(answer: AnswerText, read: CardParse): boolean {
  if (read.cutOff) return true;
  // Q-58: an empty answer at the limit is the reasoning model's, retried with more room, never continued.
  if (answer.text.trim() === '') return false;
  if (answer.finishReason !== 'length') return false;
  return read.problems.length > 0 || searchJson(answer.text).unclosed;
}

/** The answer with the fragment the model sent after being asked to continue; joined whole. */
// RF-208
export function joinFragment(earlier: string, fragment: string): string {
  return `${earlier}${fragment}`;
}
