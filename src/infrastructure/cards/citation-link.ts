import { formatCitation, type Citation } from '../../domain/cards/citation.js';
import { escapeLabel } from './markdown-text.js';
import { evidenceHref, type EvidenceSpot } from '../../domain/sources/evidence-link.js';
import { buildPermalink, type PermalinkInput } from '../../domain/sources/permalink.js';

// RF-125, RF-131: every citation rendered in an output links to the exact lines. A GitHub project
// links to GitHub at the commit; an uploaded project links to Rosetta's own evidence page of the
// card, whose address is relative to the document that holds the link.

type GithubPermalinkSource = Pick<PermalinkInput, 'owner' | 'repo' | 'commitSha'> & {
  readonly kind?: 'github' | undefined;
};

export type PermalinkSource = GithubPermalinkSource | { readonly kind: 'upload' };

/** Where a link is written and which card it cites from; `base` leads to the `report/` folder. */
export interface CitationSpot extends EvidenceSpot {
  readonly base: string;
}

/** From `spec.md` and `data-model.md`, which sit in the run folder. */
export const FROM_RUN_FOLDER = 'report/';
/** From `cards/<TYPE>/<ID>.md`. */
export const FROM_CARD_FILE = '../../report/';

function href(citation: Citation, source: PermalinkSource, spot: CitationSpot): string | undefined {
  if (source.kind === 'upload') return evidenceHref(spot.base, spot, citation);
  const link = buildPermalink({ ...source, ...citation });
  return link.ok ? link.value : undefined;
}

/** `[path:a-b](link)`; a citation whose link cannot be built stays as plain text. */
export function citationLink(
  citation: Citation,
  source: PermalinkSource,
  spot: CitationSpot,
): string {
  const label = escapeLabel(formatCitation(citation));
  const link = href(citation, source, spot);
  if (link === undefined) return label;
  return `[${label}](${link.replaceAll('(', '%28').replaceAll(')', '%29')})`;
}
