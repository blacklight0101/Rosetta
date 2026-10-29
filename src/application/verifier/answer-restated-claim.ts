import type { Claim } from '../../domain/cards/card.js';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';

// DEC-198, RF-209, RF-301, ADR-005, ADR-013, EV-56: an owner's answer is an owner fact, never source.
// The Invoice Deepen turned the owner's typed answer into claims that cite the lines the question
// was raised from (its context), and a small model passed one as Supported. The check is free and
// needs no model: the claim comes from a task that was given the answer, every citation of it falls
// inside the context lines of one answered question, and its words are the answer's words. A claim
// that cites the same lines for what they show says other things and is judged like any claim.

/** An answered question given to a reader: the lines it was raised from and the owner's answer. */
export interface OwnerAnswer {
  readonly area: string;
  readonly cardId: string;
  /** As `answers.md` holds it: `path:a-b text`, then maybe `(also cited: path:a-b, ...)`. */
  readonly context: string;
  readonly answer: string;
}

/** Fewer words than this say too little to tell a restatement from a short fact about the lines. */
const MIN_WORDS = 4;
/** The share of the claim's words that the answer holds for the claim to restate it. */
const MIN_SHARE = 0.75;

const stopWords = new Set(
  `the and for are was were with that this from into onto not but has have had its their there
  then than when what which who how why will would can could should may might all any each every
  one two per via yes also only just`.split(/\s+/u),
);

/** The lines the question was raised from: its first citation and the ones it also cited. */
function contextRanges(context: string): readonly Citation[] {
  const first = /^(.+?:\d+(?:-\d+)?)\s/u.exec(context)?.[1] ?? context.trim();
  const also = /\(also cited: ([^)]*)\)/u.exec(context)?.[1]?.split(', ') ?? [];
  return [first, ...also].flatMap((text) => {
    const parsed = parseCitation(text.trim());
    return parsed.ok ? [parsed.value] : [];
  });
}

function inside(citation: Citation, range: Citation): boolean {
  return (
    citation.path === range.path &&
    citation.startLine >= range.startLine &&
    citation.endLine <= range.endLine
  );
}

/** The words that carry meaning: lower case, without short and common words, "s" endings cut. */
function wordsOf(text: string): ReadonlySet<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((word) => word.length >= 3 && !stopWords.has(word));
  return new Set(kept.map((word) => (word.length > 3 ? word.replace(/s$/u, '') : word)));
}

function restates(claim: string, answer: string): boolean {
  const mine = [...wordsOf(claim)];
  if (mine.length < MIN_WORDS) return false;
  const theirs = wordsOf(answer);
  return mine.filter((word) => theirs.has(word)).length / mine.length >= MIN_SHARE;
}

/** Why the claim is rejected, or undefined when it does not restate an answer on its context lines. */
// RF-301
export function restatedAnswerReason(
  claim: Pick<Claim, 'text' | 'citations'>,
  answers: readonly OwnerAnswer[],
): string | undefined {
  if (claim.citations.length === 0) return undefined;
  const found = answers.find((each) => {
    const ranges = contextRanges(each.context);
    const resting = claim.citations.every((c) => ranges.some((range) => inside(c, range)));
    return resting && restates(claim.text, each.answer);
  });
  if (found === undefined) return undefined;
  return `The claim restates the owner's answer to ${found.cardId} and cites only the lines that question was raised from: an owner's answer is a fact from the owner, not source in the code.`;
}
