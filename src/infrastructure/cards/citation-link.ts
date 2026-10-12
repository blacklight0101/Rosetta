import { formatCitation, type Citation } from '../../domain/cards/citation.js';
import { buildPermalink, type PermalinkInput } from '../../domain/sources/permalink.js';

// RF-125: every citation rendered in an output links to the exact lines on GitHub at the commit.

export type PermalinkSource = Pick<PermalinkInput, 'owner' | 'repo' | 'commitSha'>;

/** One line of text for Markdown: line breaks become spaces, brackets and backslashes are escaped. */
export function inlineText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\[\]]/g, '\\$&');
}

/** `[path:a-b](permalink)`; a citation whose link cannot be built stays as plain text. */
export function citationLink(citation: Citation, source: PermalinkSource): string {
  const label = inlineText(formatCitation(citation));
  const link = buildPermalink({ ...source, ...citation });
  if (!link.ok) return label;
  return `[${label}](${link.value.replaceAll('(', '%28').replaceAll(')', '%29')})`;
}
