import { formatCitation, type Citation } from '../../domain/cards/citation.js';
import { escapeLabel } from './markdown-text.js';
import { buildPermalink, type PermalinkInput } from '../../domain/sources/permalink.js';

// RF-125: every citation rendered in an output links to the exact lines on GitHub at the commit.

export type PermalinkSource = Pick<PermalinkInput, 'owner' | 'repo' | 'commitSha'>;

/** `[path:a-b](permalink)`; a citation whose link cannot be built stays as plain text. */
export function citationLink(citation: Citation, source: PermalinkSource): string {
  const label = escapeLabel(formatCitation(citation));
  const link = buildPermalink({ ...source, ...citation });
  if (!link.ok) return label;
  return `[${label}](${link.value.replaceAll('(', '%28').replaceAll(')', '%29')})`;
}
