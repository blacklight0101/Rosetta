import type { CitationRef } from './run-state.js';

// RF-1004: a citation as the documents write it, `path:startLine-endLine`.

export const formatCitationRef = (citation: CitationRef): string =>
  `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`;
