import { formatCitation, type Citation } from '../cards/citation.js';
import { isLineRange, isRepositoryPath } from './permalink.js';

// RF-131, RFC-004 section 4.1: the citation link of an uploaded project. It goes to Rosetta's own
// evidence page of the card, `card-<ID>.html` in the `report/` folder of the run, and to the
// citation on that page, never to an external site. The page shows the file and the cited lines
// with their context, so the address needs no file path: the anchor names the claim and the
// citation, with every character that is not a letter, a digit, `-` or `_` written as `%XX`, so a
// path with spaces, brackets or non-ASCII characters opens the right lines.

/** The card (and the claim) a citation was written in. */
export interface EvidenceSpot {
  readonly cardId: string;
  /** Absent for a citation of a card that is not in a claim; the link then opens the card page. */
  readonly claimId?: string | undefined;
}

const UNRESERVED_MARKS = /[!'()*~.]/gu;

function encoded(text: string): string {
  return encodeURIComponent(text).replace(
    UNRESERVED_MARKS,
    (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

function isCitable(citation: Citation): boolean {
  return isRepositoryPath(citation.path) && isLineRange(citation.startLine, citation.endLine);
}

/**
 * The `id` of a citation on the evidence page, and the fragment of its link; undefined for a path
 * outside the project or lines that are not a range, which get no link.
 */
// RF-131
export function evidenceAnchor(claimId: string, citation: Citation): string | undefined {
  if (!isCitable(citation)) return undefined;
  return `${encoded(claimId)}:${encoded(formatCitation(citation))}`;
}

/** The file name of the evidence page of a card. */
// RF-131
export function evidencePageName(cardId: string): string {
  return `card-${encodeURIComponent(cardId)}.html`;
}

/**
 * `<base>card-<ID>.html#<anchor>`; undefined for a path outside the project or lines that are not
 * a range. `base` is the way from the document that holds the link to the `report/` folder, for
 * example `../../report/` from a card file.
 */
// RF-131
export function evidenceHref(
  base: string,
  spot: EvidenceSpot,
  citation: Citation,
): string | undefined {
  if (!isCitable(citation)) return undefined;
  const page = `${base}${evidencePageName(spot.cardId)}`;
  const anchor = spot.claimId === undefined ? undefined : evidenceAnchor(spot.claimId, citation);
  return anchor === undefined ? page : `${page}#${anchor}`;
}
