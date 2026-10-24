import type { VerdictReasonKind } from '../../domain/cards/card.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { LlmResponse } from '../ports/llm-provider.js';

// RF-301, DEC-57, ADR-013: reads the verifier's answer. The answer is model output, so it is
// parsed strictly and never trusted: exactly two lines, the reason first and the verdict second
// (`Reason: ...` then `Verdict: Supported` or `Verdict: Rejected`), and after a `Rejected` verdict
// only the optional line `Kind: defined elsewhere` (P5-35), nothing else. Anything else (a
// verdict before its reason, a third line, a verdict that is not one of the two words, a tool call,
// a cut answer) is invalid and says why, for the one retry; it is never read as `Supported`.

export type JudgedStatus = 'Supported' | 'Rejected';

export interface Verdict {
  readonly status: JudgedStatus;
  /** One line, at most `MAX_REASON_CHARS` characters. */
  readonly reason: string;
  /** P5-35: the optional third line of a `Rejected` answer. */
  readonly reasonKind?: VerdictReasonKind;
}

export const MAX_REASON_CHARS = 300;

const reasonLine = /^reason:[ \t]*(\S.*)$/iu;
const verdictLine = /^verdict:[ \t]*(supported|rejected)$/iu;
const kindLine = /^kind:[ \t]*defined[ \t]+elsewhere$/iu;
const verdictLike = /^verdict:/iu;
const lineBreak = /\r\n|[\n\r\u0085\u2028\u2029]/u;
// eslint-disable-next-line no-control-regex -- the reason is shown and stored as one plain line
const controlCharacter = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/u;

const problems = {
  toolCall: 'the answer called a tool; there are no tools.',
  cut: 'the answer was cut off before it ended.',
  lines: 'the answer must be exactly two lines: the reason, then the verdict.',
  order: 'the reason must come before the verdict.',
  reason: 'the first line must start with "Reason:" followed by one sentence.',
  long: `the reason must be at most ${String(MAX_REASON_CHARS)} characters.`,
  verdict: 'the second line must be "Verdict: Supported" or "Verdict: Rejected".',
  kind: 'a third line may only be "Kind: defined elsewhere", and only after "Verdict: Rejected".',
} as const;

/**
 * The status a verdict word names, compared in plain ASCII: the regular expression folds Unicode
 * case (`ſupported` matches), so a word that is not exactly one of the two is no verdict.
 */
function statusOf(word: string): JudgedStatus | undefined {
  const lower = word.toLowerCase();
  if (lower === 'supported') return 'Supported';
  return lower === 'rejected' ? 'Rejected' : undefined;
}

/** The reason of the first line, or what is wrong with it. */
function reasonOf(line: string): Result<string, string> {
  const reason = reasonLine.exec(line)?.[1]?.trim();
  if (reason === undefined || controlCharacter.test(reason)) return err(problems.reason);
  return reason.length > MAX_REASON_CHARS ? err(problems.long) : ok(reason);
}

/** The two lines as a verdict, or what is wrong with them. */
function verdictOf(first: string, second: string, third?: string): Result<Verdict, string> {
  if (verdictLike.test(first)) return err(problems.order);
  const reason = reasonOf(first);
  if (!reason.ok) return reason;
  const word = verdictLine.exec(second)?.[1];
  const status = word === undefined ? undefined : statusOf(word);
  if (status === undefined) return err(problems.verdict);
  const kind = kindOf(status, third);
  return kind.ok ? ok({ status, reason: reason.value, ...kind.value }) : kind;
}

/** P5-35: the third line, if any, is the kind line of a `Rejected` verdict, or the answer is refused. */
function kindOf(
  status: JudgedStatus,
  line: string | undefined,
): Result<Pick<Verdict, 'reasonKind'>, string> {
  if (line === undefined) return ok({});
  if (status !== 'Rejected' || !kindLine.test(line)) return err(problems.kind);
  return ok({ reasonKind: 'definedElsewhere' });
}

/** The verdict of an answer, or the problem the retry names (RF-301). */
// RF-301
export function parseVerdictAnswer(
  response: Pick<LlmResponse, 'text' | 'toolCalls' | 'finishReason'>,
): Result<Verdict, string> {
  if (response.toolCalls.length > 0) return err(problems.toolCall);
  if (response.finishReason === 'length') return err(problems.cut);
  const lines = response.text
    .split(lineBreak)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const [first, second, third] = lines;
  if (lines.length > 3 || lines.length < 2 || first === undefined || second === undefined) {
    const verdictFirst = first !== undefined && verdictLike.test(first);
    return err(verdictFirst ? problems.order : problems.lines);
  }
  return verdictOf(first, second, third);
}
