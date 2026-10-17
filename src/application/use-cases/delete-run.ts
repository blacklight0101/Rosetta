import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Logger } from '../ports/logger.js';
import type { RunIndex } from '../ports/run-index.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';
import { markFolder, removeFolder } from './remove-folder.js';

// RF-1012, DEC-55, RF-1105: Delete run removes the folder and the row of one of the signed-in
// user's runs that has ended, and writes an `info` entry naming it and the space freed. A run that
// is queued or running is refused (the page disables the button, the API answers 409). The cost
// ledger is not touched: it has no link to the run row, so the project totals keep every call. The
// folder goes first: if the row cannot be removed afterwards the run is still listed and can be
// deleted again, where a row removed first would leave a folder nothing points to; a folder that
// cannot be removed is logged and answered with RST-1115 (`removeFolder`, P1-121). The folder is
// marked before it is removed (P2-41), so a folder left behind is one the sweep may remove. Another user's
// run id and an unknown id give the same answer, `not found`.

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
  private readonly deps: DeleteRunDependencies;

  constructor(deps: DeleteRunDependencies) {
    this.deps = deps;
  }

  // RF-1012
  async execute(request: {
    readonly actor: Actor;
    readonly runId: string;
  }): Promise<Result<Deleted, DeleteRunProblem>> {
    const { runs, folders, logger } = this.deps;
    const { userId } = request.actor;
    const run = await runs.find(userId, request.runId);
    if (run === undefined) return err(ERROR_CODES.notFound);
    if (run.queueState !== 'Ended') return err(ERROR_CODES.deleteRefusedInUse);
    const target = { userId, projectId: run.projectId, runKey: run.runKey };
    const freedBytes = await folders.size(target);
    await markFolder(folders, logger, target);
    await removeFolder(folders, logger, target);
    if (!(await runs.removeEnded(userId, run.id))) return err(ERROR_CODES.notFound);
    await logger.log({
      level: 'info',
      logger: 'history',
      message: `Run ${run.runKey} deleted, freeing ${String(freedBytes)} bytes.`,
      userId,
      runId: run.runKey,
      data: { projectId: run.projectId, runKey: run.runKey, freedBytes },
    });
    return ok({ freedBytes });
  }
}
