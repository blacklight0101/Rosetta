import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Logger } from '../ports/logger.js';
import type { RunIndex } from '../ports/run-index.js';
import type { SnapshotCache } from '../ports/snapshot-cache.js';
import type { Deleted } from './delete-run.js';

// RF-1012, RF-1102: Delete snapshot removes a downloaded snapshot for the administrator and writes
// an `info` entry naming it and the space freed. A snapshot that a queued or running run uses is
// refused (the page disables the button, the API answers 409); runs that ended keep their reports
// and cards and only lose the files they read, which the next run fetches again. The key must name
// a snapshot the cache lists; anything else is `not found`, so a key never becomes a path.

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
  private readonly deps: DeleteSnapshotDependencies;

  constructor(deps: DeleteSnapshotDependencies) {
    this.deps = deps;
  }

  // RF-1012
  async execute(request: {
    readonly actor: Actor;
    readonly key: string;
  }): Promise<Result<Deleted, DeleteSnapshotProblem>> {
    const { snapshots, runs, logger } = this.deps;
    if (request.actor.role !== 'admin') return err(ERROR_CODES.notAllowed);
    const snapshot = (await snapshots.list()).find((listed) => listed.key === request.key);
    if (snapshot === undefined) return err(ERROR_CODES.notFound);
    const used = (await runs.snapshotUsage()).find((usage) => usage.snapshotKey === snapshot.key);
    if ((used?.active ?? 0) > 0) return err(ERROR_CODES.deleteRefusedInUse);
    if (!(await snapshots.remove(snapshot.key))) return err(ERROR_CODES.notFound);
    const freedBytes = snapshot.totalBytes;
    await logger.log({
      level: 'info',
      logger: 'history',
      message: `Snapshot ${snapshot.key} deleted, freeing ${String(freedBytes)} bytes.`,
      userId: request.actor.userId,
      data: { snapshot: snapshot.key, freedBytes },
    });
    return ok({ freedBytes });
  }
}
