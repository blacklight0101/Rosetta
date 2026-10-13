import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Logger } from '../ports/logger.js';
import type { RunIndex } from '../ports/run-index.js';
import type { SnapshotCache } from '../ports/snapshot-cache.js';
import type { Deleted } from './delete-run.js';

// RF-1012: stub, replaced by the implementation in the next commit.

export type DeleteSnapshotProblem =
  | typeof ERROR_CODES.notAllowed
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.deleteRefusedInUse;

export interface DeleteSnapshotDependencies {
  readonly snapshots: SnapshotCache;
  readonly runs: RunIndex;
  readonly logger: Logger;
}

export class DeleteSnapshot {
  constructor(deps: DeleteSnapshotDependencies) {
    void deps;
  }

  execute(request: {
    readonly actor: Actor;
    readonly key: string;
  }): Promise<Result<Deleted, DeleteSnapshotProblem>> {
    void request;
    return Promise.resolve(err(ERROR_CODES.notFound));
  }
}
