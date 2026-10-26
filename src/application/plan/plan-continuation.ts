import { searchJson } from '../cards/extract-json.js';
import { openElementStart, resumePoint } from './json-tail.js';
import type { FinishReason } from '../ports/llm-provider.js';

// RF-604, RF-208, RF-007: a planner answer that stops inside its JSON because the model hit the
// output limit is asked to go on, like the cards stage does, at most twice per call. This holds
// the pure parts: when an answer counts as cut off, how the fragment is joined to what came
// before, and the message of an answer that stays cut off. No model text goes into that message.

/** The most continuations of one planner call; the estimate reserves them (RF-613). */
export const maxPlannerContinuations = 2;

/** The shortest start of the first answer that a restart can repeat to count as a new start. */
const MIN_RESTART = 12;
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

/**
 * Whether the answer is still cut off once `continued` continuations were asked for: also an
 * answer that stops normally with JSON still open, which was continued and is still not whole.
 */
// RF-604, RF-007
export function endsCutOff(
  text: string,
  end: AnswerEnd,
  limit: number,
  continued: number,
): boolean {
  if (isCutOff(text, end, limit)) return true;
  return continued > 0 && searchJson(text).unclosed;
}

/** What the model may write right after a value boundary: a quote, punctuation or a value. */
const valueStart = /^\s*(?:["{}[\],:]|-?\d|(?:true|false|null)\b)/u;

/**
 * The answer up to its last complete JSON boundary (`resumePoint`, what the model was shown) with
 * the fragment it sent after being asked to continue. The fragment is joined whole: no stretch is
 * ever cut out of it, since a repeat of the tail cannot be told from identical items or repeated
 * text, and cutting would silently change the JSON. A fragment that does not start like JSON is
 * not joined: the answer stays cut off (RST-1805). A fragment that starts the answer again
 * replaces it. A fragment that begins the next list item where the cut item wants its next key
 * replaces the unfinished item (P5-38).
 */
// RF-604
export function joinContinuation(earlier: string, fragment: string): string {
  return joinNoting(earlier, fragment).text;
}

/** The join, and whether an unfinished list item was replaced by the next one (P3-126: it is listed). */
// RF-604, P5-38
export function joinNoting(
  earlier: string,
  fragment: string,
): { readonly text: string; readonly replaced: boolean } {
  const base = resumePoint(earlier);
  const head = base.trimStart().slice(0, RESTART_PREFIX);
  if (head.length >= MIN_RESTART && fragment.trimStart().startsWith(head)) {
    return { text: fragment, replaced: false };
  }
  if (!valueStart.test(fragment)) return { text: base, replaced: false };
  // P5-38: a fragment that opens a new element where the base wants a key (the model began the next
  // list item instead of finishing the cut one) replaces the unfinished item, so the join is JSON.
  const unfinished = /^\s*[{[]/u.test(fragment) ? openElementStart(base) : null;
  if (unfinished === null) return { text: base + fragment, replaced: false };
  return { text: base.slice(0, unfinished) + fragment, replaced: true };
}

/** RST-1805: the cause and the setting that fixes it. */
// RF-007
export function cutOffMessage(limit: number): string {
  return `The planner answer was cut off at ${String(limit)} output tokens; raise Planner max output tokens in Project settings.`;
}

/** P3-126: the item a continuation replaced is named so it is not lost silently. */
// RF-604
export const replacedMessage =
  'The planner continuation began the next list item instead of finishing the cut one; the unfinished item was left out.';
