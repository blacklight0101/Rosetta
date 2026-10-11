import { err, ok, type Result } from '../errors/result.js';

/** A full git commit SHA: 40 lower-case hexadecimal characters (RF-121). */
export interface CommitSha {
  readonly value: string;
}

export type CommitShaProblem = 'invalid-commit-sha';

const FULL_SHA = /^[0-9a-f]{40}$/;

// RF-121: a run is pinned to a full SHA; short SHAs, branches and tags are refs to resolve first.
export function parseCommitSha(text: string): Result<CommitSha, CommitShaProblem> {
  const value = text.toLowerCase();
  return FULL_SHA.test(value) ? ok({ value }) : err('invalid-commit-sha');
}
