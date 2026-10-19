import type { GitHubRepoRef } from '../../domain/sources/github-repo-ref.js';
import type { GithubSource, Source, UploadSource } from '../../domain/sources/source.js';

/** What every kind of snapshot records about its extracted tree. */
interface SnapshotTree {
  readonly fileCount: number;
  readonly totalBytes: number;
  /** Link entries and entries with a name Windows cannot write (a device name, a colon) skipped during extraction (RF-122, RF-127). */
  readonly skippedLinks: number;
  /** `sha256:` of the sorted path and file SHA-256 pairs. */
  readonly snapshotHash: string;
}

/** Where a snapshot lives on disk. */
interface SnapshotLocation {
  /** The folder name under `<data>/sources/`: `<owner>__<repo>@<sha>` or `upload__<project id>@<16 hex>`. */
  readonly key: string;
  /** Absolute path of the read-only tree (`files/` inside the snapshot folder). */
  readonly rootDir: string;
  /** True when the snapshot was already cached and nothing was downloaded (RF-122). */
  readonly cached: boolean;
}

/** The content of a GitHub `snapshot.json` (data-model.md section 3.3); every field a run manifest records (RF-126). */
export type GithubSnapshotInfo = GithubSource & SnapshotTree;

/** The content of an upload `snapshot.json`: `kind`, `fileName`, `uploadedAt` and the tree (RF-130). */
export type UploadSnapshotInfo = UploadSource & SnapshotTree;

/** The content of `snapshot.json`: a record without `kind` is a GitHub one (RF-130). */
export type SnapshotInfo = Source & SnapshotTree;

export type GithubSnapshot = GithubSnapshotInfo & SnapshotLocation;

/** A cached, read-only snapshot of either kind. Stages read `rootDir`; only the kind-specific code reads the rest. */
export type Snapshot = SnapshotInfo & SnapshotLocation;

// RF-121, RF-122: resolves a GitHub URL and ref to a commit and provides its cached, read-only
// snapshot (ADR-012). Failures are RosettaErrors in the RST-19xx range. It answers with GitHub
// snapshots only; an upload is stored by the upload use case (RF-128).
export interface SourceFetcher {
  fetch(ref: GitHubRepoRef, signal: AbortSignal): Promise<GithubSnapshot>;
}
