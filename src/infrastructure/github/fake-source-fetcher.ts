import type { Clock } from '../../application/ports/clock.js';
import type { GithubSnapshot, SourceFetcher } from '../../application/ports/source-fetcher.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { parseCommitSha } from '../../domain/sources/commit-sha.js';
import {
  repositoryUrl,
  snapshotKey,
  type GitHubRepoRef,
} from '../../domain/sources/github-repo-ref.js';

/** A repository the fake knows; `refs` maps branches, tags and SHAs to full SHAs. */
export interface FakeSnapshotEntry {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly refs: Readonly<Record<string, string>>;
  /** Where the fixture tree lives; the fake never reads it. */
  readonly rootDir: string;
  readonly snapshotHash: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly licence?: string;
}

/**
 * RF-121, RF-122 test double of the SourceFetcher port: no network, no disk. It answers from a
 * table of repositories, remembers which commits it has "downloaded" and records every call.
 */
export class FakeSourceFetcher implements SourceFetcher {
  readonly fetched: GitHubRepoRef[] = [];
  private readonly entries: readonly FakeSnapshotEntry[];
  private readonly clock: Clock;
  private readonly cached = new Set<string>();

  constructor(entries: readonly FakeSnapshotEntry[], clock: Clock) {
    this.entries = entries;
    this.clock = clock;
  }

  fetch(ref: GitHubRepoRef, signal: AbortSignal): Promise<GithubSnapshot> {
    this.fetched.push(ref);
    if (signal.aborted) {
      return Promise.reject(
        signal.reason instanceof Error ? signal.reason : new Error('The fetch was aborted.'),
      );
    }
    const entry = this.entries.find(
      (candidate) =>
        candidate.owner.toLowerCase() === ref.owner.toLowerCase() &&
        candidate.repo.toLowerCase() === ref.repo.toLowerCase(),
    );
    if (entry === undefined) {
      return Promise.reject(new RosettaError(ERROR_CODES.githubSourceUnavailable));
    }
    const refName = ref.ref ?? entry.defaultBranch;
    const sha = parseCommitSha(entry.refs[refName] ?? '');
    if (!sha.ok) return Promise.reject(new RosettaError(ERROR_CODES.githubRefNotFound));
    const key = snapshotKey(entry, sha.value);
    const cached = this.cached.has(key);
    this.cached.add(key);
    return Promise.resolve({
      key,
      rootDir: entry.rootDir,
      cached,
      url: repositoryUrl(entry),
      owner: entry.owner,
      repo: entry.repo,
      commitSha: sha.value.value,
      resolvedFrom: refName,
      downloadedAt: this.clock.now().toISOString(),
      fileCount: entry.fileCount,
      totalBytes: entry.totalBytes,
      skippedLinks: 0,
      snapshotHash: entry.snapshotHash,
      licence: entry.licence ?? 'unknown',
    });
  }
}
