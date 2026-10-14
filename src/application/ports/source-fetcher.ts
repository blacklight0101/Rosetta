import type { GitHubRepoRef } from '../../domain/sources/github-repo-ref.js';

/** The content of `snapshot.json` (data-model.md section 3.3); every field a run manifest records (RF-126). */
export interface SnapshotInfo {
  /** Canonical `https://github.com/<owner>/<repo>`. */
  readonly url: string;
  /** Owner and repository as GitHub spells them. */
  readonly owner: string;
  readonly repo: string;
  /** 40 hexadecimal characters. */
  readonly commitSha: string;
  /** The ref that was resolved: the one asked for, or the default branch when the URL had none. */
  readonly resolvedFrom: string;
  /** ISO 8601 instant in UTC. */
  readonly downloadedAt: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  /** Link entries and entries with a name Windows cannot write (a device name, a colon) skipped during extraction (RF-122, RF-127). */
  readonly skippedLinks: number;
  /** `sha256:` of the sorted path and file SHA-256 pairs. */
  readonly snapshotHash: string;
  /** SPDX id reported by GitHub, or `unknown`. */
  readonly licence: string;
}

export interface Snapshot extends SnapshotInfo {
  /** The folder name `<owner>__<repo>@<sha>` under `<data>/sources/`. */
  readonly key: string;
  /** Absolute path of the read-only repository tree (`files/` inside the snapshot folder). */
  readonly rootDir: string;
  /** True when the snapshot was already cached and nothing was downloaded (RF-122). */
  readonly cached: boolean;
}

// RF-121, RF-122: resolves a GitHub URL and ref to a commit and provides its cached, read-only
// snapshot (ADR-012). Failures are RosettaErrors in the RST-19xx range.
export interface SourceFetcher {
  fetch(ref: GitHubRepoRef, signal: AbortSignal): Promise<Snapshot>;
}
