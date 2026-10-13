import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { parseCommitSha } from '../../domain/sources/commit-sha.js';
import type { CardSource } from '../ports/card-outputs.js';

// RF-125: the cards of an understand run cite the repository of the run at the commit of the scan
// they read, so their permalinks stay pinned to that commit.

/** The pinned repository of the citations' permalinks (RF-125). */
export function pinnedSourceOf(
  source: { readonly owner: string; readonly repo: string },
  scannedCommitSha: string,
): CardSource {
  const commitSha = parseCommitSha(scannedCommitSha);
  if (!commitSha.ok) {
    throw new RosettaError(ERROR_CODES.codeMapInvalid, 'The scan recorded no valid commit.');
  }
  return { owner: source.owner, repo: source.repo, commitSha: commitSha.value };
}
