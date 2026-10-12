import type { CitationRef, SourceState } from './run-state.js';

// RF-1004, RF-125: the link from a claim to the cited lines on GitHub, pinned to the commit.

/** `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<a>-L<b>`; undefined when anything is unusable. */
// RF-1004
export function citationHref(
  source: SourceState | undefined,
  citation: CitationRef,
): string | undefined {
  void source;
  void citation;
  return undefined;
}
