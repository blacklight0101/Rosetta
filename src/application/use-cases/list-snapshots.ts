import type { Actor } from '../../domain/accounts/actor.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RunIndex } from '../ports/run-index.js';
import type { CachedSnapshot, SnapshotCache } from '../ports/snapshot-cache.js';

// RF-1012, RF-1102: List snapshots gives the administrator the downloaded snapshots with their size
// and how the runs of every user use them: how many, how many are still queued or running (the
// snapshot cannot be deleted then) and when one last used it. Snapshots are shared by all users,
// so a user who is not the administrator is refused before anything is read.

export interface ListedSnapshot {
  readonly snapshot: CachedSnapshot;
  readonly runs: number;
  /** The runs among them that are queued or running. */
  readonly activeRuns: number;
  /** Null for a snapshot no run recorded. */
  readonly lastUsedAt: EpochMs | null;
}

export interface ListSnapshotsDependencies {
  readonly snapshots: SnapshotCache;
  readonly runs: RunIndex;
}

export class ListSnapshots {
  private readonly deps: ListSnapshotsDependencies;

  constructor(deps: ListSnapshotsDependencies) {
    this.deps = deps;
  }

  // RF-1012
  async execute(request: {
    readonly actor: Actor;
  }): Promise<Result<readonly ListedSnapshot[], typeof ERROR_CODES.notAllowed>> {
    if (request.actor.role !== 'admin') return err(ERROR_CODES.notAllowed);
    const [snapshots, usage] = await Promise.all([
      this.deps.snapshots.list(),
      this.deps.runs.snapshotUsage(),
    ]);
    const byKey = new Map(usage.map((used) => [used.snapshotKey, used]));
    return ok(
      snapshots.map((snapshot) => {
        const used = byKey.get(snapshot.key);
        return {
          snapshot,
          runs: used?.runs ?? 0,
          activeRuns: used?.active ?? 0,
          lastUsedAt: used?.lastUsedAt ?? null,
        };
      }),
    );
  }
}
