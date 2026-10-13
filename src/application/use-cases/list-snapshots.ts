import type { Actor } from '../../domain/accounts/actor.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { RunIndex } from '../ports/run-index.js';
import type { CachedSnapshot, SnapshotCache } from '../ports/snapshot-cache.js';

// RF-1012: stub, replaced by the implementation in the next commit.

export interface ListedSnapshot {
  readonly snapshot: CachedSnapshot;
  readonly runs: number;
  readonly activeRuns: number;
  readonly lastUsedAt: EpochMs | null;
}

export interface ListSnapshotsDependencies {
  readonly snapshots: SnapshotCache;
  readonly runs: RunIndex;
}

export class ListSnapshots {
  constructor(deps: ListSnapshotsDependencies) {
    void deps;
  }

  execute(request: {
    readonly actor: Actor;
  }): Promise<Result<readonly ListedSnapshot[], typeof ERROR_CODES.notAllowed>> {
    void request;
    return Promise.resolve(err(ERROR_CODES.notAllowed));
  }
}
