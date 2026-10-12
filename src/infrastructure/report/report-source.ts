// RF-504, RF-125: the link to the commit a run read, built by Rosetta from a normalised GitHub
// address and a full commit hash; anything else is shown as text and linked nowhere.

const REPOSITORY = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u;
const COMMIT = /^[0-9a-f]{40}$/u;

export interface SourceLink {
  readonly label: string;
  readonly href: string;
}

/** The link to the tree of the commit, or undefined when the address or the commit is unusable. */
export function sourceLink(
  source: { readonly url: string; readonly commitSha: string | null } | null,
): SourceLink | undefined {
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
