import type { CitationRef, SourceState } from './run-state.js';

// RF-1004, RF-125: the link from a claim to the cited lines on GitHub, pinned to the commit.

const OWNER_OR_REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

/** The folder of the source and the cited path as clean segments; undefined for anything else. */
function segmentsOf(subpath: string, path: string): string[] | undefined {
  const folder = subpath === '' ? [] : subpath.split('/');
  const all = [...folder, ...path.split('/')];
  const clean = all.every((part) => part !== '' && part !== '.' && part !== '..');
  return clean && !path.includes('\\') ? all : undefined;
}

/** True for a source whose repository and commit are fit to build a link from. */
function isLinkable(
  source: SourceState | undefined,
): source is SourceState & { commitSha: string } {
  return (
    source?.commitSha !== undefined &&
    COMMIT.test(source.commitSha) &&
    OWNER_OR_REPO.test(source.owner) &&
    OWNER_OR_REPO.test(source.repo)
  );
}

function linesOf({ startLine, endLine }: CitationRef): string | undefined {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) return undefined;
  if (startLine < 1 || endLine < startLine) return undefined;
  return startLine === endLine
    ? `L${String(startLine)}`
    : `L${String(startLine)}-L${String(endLine)}`;
}

/** `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<a>-L<b>`; undefined when anything is unusable. */
// RF-1004
export function citationHref(
  source: SourceState | undefined,
  citation: CitationRef,
): string | undefined {
  if (!isLinkable(source)) return undefined;
  const lines = linesOf(citation);
  const segments = segmentsOf(source.subpath, citation.path);
  if (lines === undefined || segments === undefined) return undefined;
  const path = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `https://github.com/${source.owner}/${source.repo}/blob/${source.commitSha}/${path}#${lines}`;
}
