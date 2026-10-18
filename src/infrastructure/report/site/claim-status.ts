// RF-500, RF-502: how a claim status is written on the report pages: a word and a glyph, never
// colour alone.

/** The glyph that goes with a claim status; the status name is always written next to it. */
export const STATUS_GLYPHS: Readonly<Record<string, string>> = {
  Supported: 'check',
  Rejected: 'cross',
  CitationInvalid: 'warning',
  Proposed: 'dot',
  Unverified: 'open',
};

/** The status as words (the vocabulary writes `CitationInvalid` as one word). */
export function statusLabel(status: string): string {
  return status === 'CitationInvalid' ? 'Citation invalid' : status;
}
