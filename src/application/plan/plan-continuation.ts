import { searchJson } from '../cards/extract-json.js';
import type { FinishReason } from '../ports/llm-provider.js';

// RF-604, RF-208, RF-007: a planner answer that stops inside its JSON because the model hit the
// output limit is asked to go on, like the cards stage does, at most twice per call. This holds
// the pure parts: when an answer counts as cut off, how the fragment is joined to what came
// before, and the message of an answer that stays cut off. No model text goes into that message.

/** The most continuations of one planner call; the estimate reserves them (RF-613). */
export const maxPlannerContinuations = 2;

/** The shortest repeated stretch that counts as the model saying its last words again. */
const MIN_OVERLAP = 12;
/** The longest repeated stretch looked for. */
const MAX_OVERLAP = 400;
/** How much of the first answer a restart has to repeat to count as a new start. */
const RESTART_PREFIX = 24;

export interface AnswerEnd {
  readonly finishReason: Exclude<FinishReason, 'error'>;
  readonly outputTokens: number;
}

/**
 * Whether the answer was cut off at the output limit: the provider says so and no JSON of the
 * answer is complete, or (a provider that reports no stop reason) it used the whole limit and
 * ends inside JSON it started.
 */
// RF-604
export function isCutOff(text: string, end: AnswerEnd, limit: number): boolean {
  const json = searchJson(text);
  if (end.finishReason === 'length') return json.unclosed || json.values.length === 0;
  return end.outputTokens >= limit && json.unclosed;
}

/** Whether the answer is cut off after `continued` continuations. */
// RF-604, RF-007
export function endsCutOff(
  text: string,
  end: AnswerEnd,
  limit: number,
  continued: number,
): boolean {
  return continued < 0 || isCutOff(text, end, limit);
}

/** The answer so far with the fragment the model sent after being asked to continue. */
// RF-604
export function joinContinuation(earlier: string, fragment: string): string {
  const head = earlier.trimStart().slice(0, RESTART_PREFIX);
  if (head.length >= MIN_OVERLAP && fragment.trimStart().startsWith(head)) return fragment;
  const longest = Math.min(earlier.length, fragment.length, MAX_OVERLAP);
  for (let size = longest; size >= MIN_OVERLAP; size -= 1) {
    const repeated = fragment.slice(0, size);
    if (repeated.trim() !== '' && earlier.endsWith(repeated)) {
      return earlier + fragment.slice(size);
    }
  }
  return earlier + fragment;
}

/** RST-1805: the cause and the setting that fixes it. */
// RF-007
export function cutOffMessage(limit: number): string {
  return `The planner answer was cut off at ${String(limit)} output tokens; raise Planner max output tokens in Project settings.`;
}
