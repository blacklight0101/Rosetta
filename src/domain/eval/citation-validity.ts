import { byCodeUnit } from '../code-map/code-unit-order.js';
import { formatCitation, type Citation } from '../cards/citation.js';
import type { EvaluatedClaim } from './claim-match.js';
import { ratio } from './ratio.js';

// RFC-001 section 7, ADR-005: the share of the citations of `Supported` claims that point at lines
// that exist: a file of the scan's code map and a range that ends at or before its last line. The
// line counts come from the code map, never from a path read on disk, so a model's path cannot
// reach the file system. Invalid citations are listed once each, in code-unit order.

export interface CitationValidity {
  readonly checked: number;
  readonly valid: number;
  readonly rate: number | null;
  readonly invalid: readonly string[];
}

function exists(citation: Citation, lines: ReadonlyMap<string, number>): boolean {
  const last = lines.get(citation.path);
  return (
    last !== undefined &&
    citation.startLine >= 1 &&
    citation.startLine <= citation.endLine &&
    citation.endLine <= last
  );
}

// RFC-001 section 7
export function citationValidity(
  claims: readonly EvaluatedClaim[],
  lines: ReadonlyMap<string, number>,
): CitationValidity {
  const cited = claims
    .filter((claim) => claim.status === 'Proposed') // P2-11 red step: removed by the feat commit.
    .flatMap((claim) => claim.citations);
  const invalid = cited.filter((citation) => !exists(citation, lines));
  return {
    checked: cited.length,
    valid: cited.length - invalid.length,
    rate: ratio(cited.length - invalid.length, cited.length),
    invalid: [...new Set(invalid.map(formatCitation))].sort(byCodeUnit),
  };
}
