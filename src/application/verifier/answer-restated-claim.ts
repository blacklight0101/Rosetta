import type { Claim } from '../../domain/cards/card.js';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';
import type { CitedExcerpt } from './cited-lines.js';

// DEC-198, RF-209, RF-301, ADR-005, ADR-013, EV-56: an owner's answer is an owner fact, never source.
// The Invoice Deepen turned the owner's typed answer into claims that cite the lines the question
// was raised from (its context), and a small model passed them as Supported. The check is free and
// needs no model, so it runs once the cited lines are read: the claim comes from a task that was
// given the answer, every citation of it falls inside the context lines of one answered question,
// and most of the claim's words that the cited lines do not hold are words of the answer (an
// answer of fewer than 4 meaningful words is left to the verifier model, a known gap). A claim
// that says what the lines show has no such words and is judged like any claim.

/** An answered question given to a reader: the lines it was raised from and the owner's answer. */
export interface OwnerAnswer {
  readonly area: string;
  readonly cardId: string;
  /** As `answers.md` holds it: `path:a-b text`, then maybe `(also cited: path:a-b, ...)`. */
  readonly context: string;
  readonly answer: string;
}

/** The claim words absent from the cited lines that come from the owner, at least this many ... */
const MIN_OWNER_WORDS = 3;
/** ... and at least this share of the claim words absent from the cited lines. */
const MIN_OWNER_SHARE = 0.5;
/** An answer of fewer meaningful words than this is left to the verifier model: a known gap. */
const SHORT_ANSWER = 4;

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

/**
 * The words that carry meaning: identifiers split at camelCase, PascalCase and snake_case, lower
 * case, without short and common words, "s" endings cut.
 */
function wordsOf(text: string): ReadonlySet<string> {
  const split = text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2');
  const words = split.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((word) => word.length >= 3 && !stopWords.has(word));
  return new Set(kept.map((word) => (word.length > 3 ? word.replace(/s$/u, '') : word)));
}

/** The text of the cited lines; the margin lines of an excerpt are not cited. */
function citedText(excerpts: readonly CitedExcerpt[]): string {
  return excerpts
    .filter((excerpt) => !excerpt.skipped)
    .flatMap((excerpt) => {
      const from = excerpt.citedStartLine ?? excerpt.startLine;
      const to = excerpt.citedEndLine ?? excerpt.endLine;
      return excerpt.lines.filter((_, index) => {
        const line = excerpt.startLine + index;
        return line >= from && line <= to;
      });
    })
    .join('\n');
}

/** Whether the claim words the cited lines do not hold are, for the most part, the owner's. */
function restates(claim: string, answer: OwnerAnswer, cited: string): boolean {
  const shown = wordsOf(cited);
  const beyond = [...wordsOf(claim)].filter((word) => !shown.has(word));
  const owner = wordsOf(answer.answer);
  if (owner.size < SHORT_ANSWER) return false;
  const fromOwner = beyond.filter((word) => owner.has(word));
  return fromOwner.length >= MIN_OWNER_WORDS && fromOwner.length / beyond.length >= MIN_OWNER_SHARE;
}

/** Why the claim is rejected, or undefined when it does not restate an answer on its context lines. */
// RF-301
export function restatedAnswerReason(
  claim: Pick<Claim, 'text' | 'citations'>,
  answers: readonly OwnerAnswer[],
  excerpts: readonly CitedExcerpt[],
): string | undefined {
  if (claim.citations.length === 0) return undefined;
  const cited = citedText(excerpts);
  const found = answers.find((each) => {
    const ranges = contextRanges(each.context);
    const resting = claim.citations.every((c) => ranges.some((range) => inside(c, range)));
    return resting && restates(claim.text, each, cited);
  });
  if (found === undefined) return undefined;
  return `The claim restates the owner's answer to ${found.cardId} and cites only the lines that question was raised from: an owner's answer is a fact from the owner, not source in the code.`;
}
