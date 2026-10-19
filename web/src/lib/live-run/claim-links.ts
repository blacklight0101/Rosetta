import type {
  CitationRef,
  GithubSourceState,
  SourceState,
  UploadSourceState,
} from './run-state.js';

// RF-1004, RF-125, RF-131: the link from a claim to the cited lines: on GitHub, pinned to the commit,
// for a GitHub project; on Rosetta's own evidence page of the card, for an uploaded one.

const OWNER_OR_REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

/** The card and the claim a citation belongs to; an uploaded project's link needs both. */
export interface ClaimRef {
  readonly cardId: string;
  readonly claimId: string;
}

/** The folder of the source and the cited path as clean segments; undefined for anything else. */
function segmentsOf(subpath: string, path: string): string[] | undefined {
  const folder = subpath === '' ? [] : subpath.split('/');
  const all = [...folder, ...path.split('/')];
  const clean = all.every((part) => part !== '' && part !== '.' && part !== '..');
  return clean && !path.includes('\\') ? all : undefined;
}

/** True for a source whose repository and commit are fit to build a link from. */
function isLinkable(
  source: GithubSourceState,
): source is GithubSourceState & { commitSha: string } {
  return (
    source.commitSha !== undefined &&
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

function githubHref(source: GithubSourceState, citation: CitationRef): string | undefined {
  if (!isLinkable(source)) return undefined;
  const lines = linesOf(citation);
  const segments = segmentsOf(source.subpath, citation.path);
  if (lines === undefined || segments === undefined) return undefined;
  const path = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `https://github.com/${source.owner}/${source.repo}/blob/${source.commitSha}/${path}#${lines}`;
}

/** The same rule as `evidenceAnchor` in the domain: only letters, digits, `-` and `_` stay as they are. */
function encoded(text: string): string {
  return encodeURIComponent(text).replace(
    /[!'()*~.]/gu,
    (mark) => `%${mark.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

/** RF-131: `/runs/<run>/files/report/card-<ID>.html#<claim>:<citation>`, the page of the report. */
function evidenceHref(
  source: UploadSourceState,
  citation: CitationRef,
  claim: ClaimRef | undefined,
): string | undefined {
  if (source.runId === undefined || claim === undefined) return undefined;
  if (linesOf(citation) === undefined || segmentsOf('', citation.path) === undefined) {
    return undefined;
  }
  const cited = `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`;
  const page = `card-${encodeURIComponent(claim.cardId)}.html`;
  const anchor = `${encoded(claim.claimId)}:${encoded(cited)}`;
  return `/runs/${encodeURIComponent(source.runId)}/files/report/${page}#${anchor}`;
}

/** The link of a citation; undefined when the source or the citation is not fit to build one. */
// RF-1004, RF-131
export function citationHref(
  source: SourceState | undefined,
  citation: CitationRef,
  claim?: ClaimRef,
): string | undefined {
  if (source === undefined) return undefined;
  return source.kind === 'upload'
    ? evidenceHref(source, citation, claim)
    : githubHref(source, citation);
}
