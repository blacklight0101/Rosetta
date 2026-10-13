import {
  transitionClaim,
  type Card,
  type Claim,
  type ClaimVerdict,
} from '../../domain/cards/card.js';
import { formatCitation, type Citation } from '../../domain/cards/citation.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';

// RF-300, RF-302, ADR-005, DEC-19: step 1 of the verifier. Every citation of a claim must name a
// file of the code map (the exact path, as the permalink needs it) and a line range inside that
// file, in whole lines with `1 <= start <= end`; otherwise the claim becomes `CitationInvalid` with
// the reason. A claim that passes stays `Proposed` until the judgement step (DEC-103). A claim is
// never removed, only its status and verdict change. The check costs nothing: no model is called.

interface CitationCheck {
  readonly claimId: string;
  readonly ok: boolean;
  readonly reason?: string;
}

export interface CheckedCards {
  readonly cards: readonly Card[];
  /** One result per claim that was `Proposed`, in card and claim order. */
  readonly checks: readonly CitationCheck[];
}

/** The name the verdict of this step carries where the judgement step names its model. */
const CHECKER = 'citation-check';

/** Why a citation's range is not `1 <= start <= end` in whole lines, or undefined when it is. */
function rangeProblemOf(citation: Citation): string | undefined {
  const { startLine, endLine } = citation;
  const cited = formatCitation(citation);
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    return `${cited} has a line number that is not a whole number.`;
  }
  if (startLine < 1) return `${cited} does not start at line 1 or later.`;
  return endLine < startLine ? `${cited} ends before it starts.` : undefined;
}

/** Why a citation does not hold, or undefined when it does. */
function problemOf(citation: Citation, lines: ReadonlyMap<string, number>): string | undefined {
  const range = rangeProblemOf(citation);
  if (range !== undefined) return range;
  const fileLines = lines.get(citation.path);
  if (fileLines === undefined) return `${citation.path} is not a file of the code map.`;
  if (citation.endLine <= fileLines) return undefined;
  return `${formatCitation(citation)} ends after the last line of the file (${String(fileLines)}).`;
}

function reasonOf(claim: Claim, lines: ReadonlyMap<string, number>): string | undefined {
  const problems = claim.citations.flatMap((citation) => problemOf(citation, lines) ?? []);
  return problems.length === 0 ? undefined : problems.join(' ');
}

function checkCard(
  card: Card,
  lines: ReadonlyMap<string, number>,
  at: string,
): { card: Card; checks: CitationCheck[] } {
  let checked = card;
  const checks: CitationCheck[] = [];
  for (const claim of card.claims) {
    if (claim.status !== 'Proposed') continue;
    const reason = reasonOf(claim, lines);
    if (reason === undefined) {
      checks.push({ claimId: claim.claimId, ok: true });
      continue;
    }
    const verdict: ClaimVerdict = { step: 'citation', reason, model: CHECKER, at };
    const moved = transitionClaim(checked, claim.claimId, 'CitationInvalid', verdict);
    if (moved.ok) checked = moved.value;
    checks.push({ claimId: claim.claimId, ok: false, reason });
  }
  return { card: checked, checks };
}

// RF-300, RF-302
export function checkCitations(
  cards: readonly Card[],
  codeMap: Pick<CodeMap, 'files'>,
  at: string,
): CheckedCards {
  const lines = new Map(codeMap.files.map((file) => [file.path, file.lines]));
  const results = cards.map((card) => checkCard(card, lines, at));
  return {
    cards: results.map((result) => result.card),
    checks: results.flatMap((result) => result.checks),
  };
}
