// Architecture section 7 (`SnapshotCache`), RF-1012, data-model.md section 3.3: the snapshots
// downloaded to `<data>/sources/`, listed from their `snapshot.json` and removed by the
// administrator. Only a complete snapshot is listed; a partial download is not.

export interface CachedSnapshot {
  /** The folder name `<owner>__<repo>@<sha>`. */
  readonly key: string;
  /** `<owner>/<repo>` as GitHub spells it. */
  readonly repository: string;
  readonly commitSha: string;
  /** ISO 8601 UTC instant of the download, as `snapshot.json` records it. */
  readonly downloadedAt: string;
  readonly fileCount: number;
  /** The bytes of the repository tree. */
  readonly totalBytes: number;
}

export interface SnapshotCache {
  /** The complete snapshots, by repository then newest download first. */
  list(): Promise<readonly CachedSnapshot[]>;
  /** Removes the snapshot folder; false when there is no such snapshot. */
  remove(key: string): Promise<boolean>;
}
