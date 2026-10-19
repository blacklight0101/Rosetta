import type { Citation } from '../../domain/cards/citation.js';
import type { GithubReportSource } from '../../application/report/report-model.js';
import { buildPermalink } from '../../domain/sources/permalink.js';
import { parseCommitSha } from '../../domain/sources/commit-sha.js';

// RF-504, RF-125: the link to the commit a run read, built by Rosetta from a normalised GitHub
// address and a full commit hash; anything else is shown as text and linked nowhere.

// Owner and repository are not `.` or `..`: those would turn the link into another path on github.com.
const REPOSITORY =
  /^https:[/][/]github[.]com[/](?![.]{1,2}[/])([A-Za-z0-9_.-]+)[/](?![.]{1,2}$)([A-Za-z0-9_.-]+)$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

/** RF-131: whether the run is on an uploaded zip. */
export function isUploadModel(model: {
  readonly source: { readonly kind?: string | undefined } | null;
}): boolean {
  return model.source?.kind === 'upload';
}

export interface SourceLink {
  readonly label: string;
  readonly href: string;
}

/** The link to the tree of the commit, or undefined when the address or the commit is unusable. */
export function sourceLink(source: GithubReportSource | null): SourceLink | undefined {
  if (source === null) return undefined;
  const { url, commitSha } = source;
  if (commitSha === null || !COMMIT.test(commitSha)) return undefined;
  const match = REPOSITORY.exec(url);
  if (match === null) return undefined;
  return {
    label: `${match[1] ?? ''}/${match[2] ?? ''} @ ${commitSha.slice(0, 12)}`,
    href: `${url}/tree/${commitSha}`,
  };
}

/**
 * RF-125: the permalink of a citation, `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<a>-L<b>`,
 * built from the repository address and the commit the run recorded and from nothing the model
 * wrote; undefined when the address, the commit or the citation is unusable.
 */
export function citationPermalink(
  source: GithubReportSource | null,
  citation: Citation,
): string | undefined {
  const sha = source?.commitSha;
  if (source === null || typeof sha !== 'string') return undefined;
  const match = REPOSITORY.exec(source.url);
  const commitSha = parseCommitSha(sha);
  if (match === null || !commitSha.ok) return undefined;
  const link = buildPermalink({
    ...{ owner: match[1] ?? '', repo: match[2] ?? '', commitSha: commitSha.value },
    ...citation,
  });
  return link.ok ? link.value : undefined;
}
