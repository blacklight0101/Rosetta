import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Logger } from '../ports/logger.js';
import type { RunIndex } from '../ports/run-index.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';

// RF-1012, DEC-55, RF-1105: stub, replaced by the implementation in the next commit.

/** What a deletion freed on disk. */
export interface Deleted {
  readonly freedBytes: number;
}

export type DeleteRunProblem = typeof ERROR_CODES.notFound | typeof ERROR_CODES.deleteRefusedInUse;

export interface DeleteRunDependencies {
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
  readonly logger: Logger;
}

export class DeleteRun {
  constructor(deps: DeleteRunDependencies) {
    void deps;
  }

  execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<Deleted, DeleteRunProblem>> {
    void request;
    return Promise.resolve(err(ERROR_CODES.notFound));
  }
}
