import { searchJson } from '../cards/extract-json.js';
import { resumePoint } from './json-tail.js';
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
/**
 * The longest unit of a repeated stretch too plain to tell a repeat from new text. Such a stretch
 * (`aaaa`, `1, 1, 1,`) is not joined either way: the answer stays cut off and ends in RST-1805,
 * because either reading could silently change the JSON. Repeats under MIN_OVERLAP characters are
 * not looked for (they are joined as written, as before P3-31).
 */
const MAX_PERIOD = 4;

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
 * How many characters at the start of the fragment repeat the end of the answer: 0 for none, -1
 * when the repeated stretch is a few characters over and over (`aaaa`, `1, 1, 1,`), which reads
 * as a repeat and as new text alike, so no join is safe.
 */
function repeatedSize(earlier: string, fragment: string): number {
  const longest = Math.min(earlier.length, fragment.length, MAX_OVERLAP);
  for (let size = longest; size >= MIN_OVERLAP; size -= 1) {
    const repeated = fragment.slice(0, size);
    if (repeated.trim() === '' || !earlier.endsWith(repeated)) continue;
    return hasShortPeriod(repeated) ? -1 : size;
  }
  return 0;
}

function hasShortPeriod(text: string): boolean {
  for (let period = 1; period <= MAX_PERIOD; period += 1) {
    let same = true;
    for (let index = period; index < text.length && same; index += 1) {
      same = text[index] === text[index - period];
    }
    if (same) return true;
  }
  return false;
}

/**
 * The answer up to its last complete JSON boundary (`resumePoint`, what the model was shown) with
 * the fragment it sent after being asked to continue. A fragment that does not start like JSON, or
 * repeats the end so plainly that it cannot be told from new text, is not joined: the answer
 * stays cut off, never JSON that was silently altered.
 */
// RF-604
export function joinContinuation(earlier: string, fragment: string): string {
  const base = resumePoint(earlier);
  const head = base.trimStart().slice(0, RESTART_PREFIX);
  if (head.length >= MIN_OVERLAP && fragment.trimStart().startsWith(head)) return fragment;
  const size = repeatedSize(base, fragment);
  if (size < 0) return base;
  const rest = fragment.slice(size);
  return valueStart.test(rest) ? base + rest : base;
}

/** RST-1805: the cause and the setting that fixes it. */
// RF-007
export function cutOffMessage(limit: number): string {
  return `The planner answer was cut off at ${String(limit)} output tokens; raise Planner max output tokens in Project settings.`;
}
