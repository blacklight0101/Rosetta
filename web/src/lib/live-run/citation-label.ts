import type { CitationRef } from './run-state.js';

/** `27` for one line, `27-30` for several: a range of one line is not written `27-27`. */
export const lineRangeText = (startLine: number, endLine: number): string =>
  startLine === endLine ? String(startLine) : `${String(startLine)}-${String(endLine)}`;

// RF-1004: a citation as the documents write it, `path:startLine-endLine`; a range of one line is
// `path:line`.

export const formatCitationRef = (citation: CitationRef): string => {
  const { path, startLine, endLine } = citation;
  return `${path}:${lineRangeText(startLine, endLine)}`;
};
