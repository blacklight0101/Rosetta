import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { UploadStore } from '../ports/upload-store.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';
import type { Deleted, DeleteRunProblem } from './delete-run.js';
import { markFolder, removeFolder } from './remove-folder.js';

// RF-1012, DEC-55, RF-1105: Delete project removes one of the signed-in user's projects with its
// runs and its whole folder, and writes an `info` entry naming it and the space freed. A project
// with a run that is queued or running is refused. The cost ledger is not touched, so the user's
// totals keep every call of the project. The repository removes the project under a lock on its row
// and its own check (PostgreSQL refuses a project whose run was queued in the meantime, P1-121),
// commits, and only then is the folder removed, so a slow disk holds no connection and no lock
// (P1-138). A folder that cannot be removed is logged with RST-1115 naming it and answered with
// that code; the project is already gone, so the folder stays for the administrator to remove
// (data-model.md section 9). Before any row goes the folder is marked (P2-41), and the mark is
// taken off again when the repository refuses; the sweep removes only marked folders. Another user's project id and
// an unknown id give the same answer, `not found`.

export interface DeleteProjectDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
  readonly logger: Logger;
  /** RF-133: the snapshots of an upload project go with it. */
  readonly uploads?: Pick<UploadStore, 'removeAllOf'>;
}

export class DeleteProject {
  private readonly deps: DeleteProjectDependencies;

  constructor(deps: DeleteProjectDependencies) {
    this.deps = deps;
  }

  // RF-1012
  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<Deleted, DeleteRunProblem>> {
    const { projects, runs, folders, logger } = this.deps;
    const { userId } = request.actor;
    const project = await projects.find(userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const own = await runs.list(userId, project.id);
    if (own.some((run) => run.queueState !== 'Ended')) return err(ERROR_CODES.deleteRefusedInUse);
    const target = { userId, projectId: project.id };
    const freedBytes = await folders.size(target);
    await markFolder(folders, logger, target);
    const afterRowsGone = async (): Promise<void> => {
      await runs.removeEndedOfProject(userId, project.id);
      await removeFolder(folders, logger, target, 'gone');
    };
    if (!(await projects.remove(userId, project.id, afterRowsGone))) {
      // A mark that stays is cleared by the sweep, because the row is still there.
      await folders.unmark(target).catch(() => undefined);
      const stillThere = (await projects.find(userId, project.id)) !== undefined;
      return err(stillThere ? ERROR_CODES.deleteRefusedInUse : ERROR_CODES.notFound);
    }
    await logger.log({
      level: 'info',
      logger: 'history',
      message: `Project ${project.name} deleted with ${String(own.length)} run(s), freeing ${String(freedBytes)} bytes.`,
      userId,
      data: { projectId: project.id, name: project.name, runs: own.length, freedBytes },
    });
    return ok({ freedBytes });
  }
}
