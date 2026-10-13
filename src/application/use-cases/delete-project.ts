import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';
import type { Deleted, DeleteRunProblem } from './delete-run.js';

// RF-1012, DEC-55, RF-1105: Delete project removes one of the signed-in user's projects with its
// runs and its whole folder, and writes an `info` entry naming it and the space freed. A project
// with a run that is queued or running is refused. The cost ledger is not touched, so the user's
// totals keep every call of the project. The rows go first and under the database's own check
// (PostgreSQL refuses a project whose run started in the meantime), then the folder: a folder that
// cannot be removed is then an orphan the next start can ignore, where a folder removed first would
// leave a project whose files are gone. Another user's project id and an unknown id give the same
// answer, `not found`.

export interface DeleteProjectDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
  readonly logger: Logger;
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
    if (!(await projects.remove(userId, project.id))) {
      const stillThere = (await projects.find(userId, project.id)) !== undefined;
      return err(stillThere ? ERROR_CODES.deleteRefusedInUse : ERROR_CODES.notFound);
    }
    await runs.removeEndedOfProject(userId, project.id);
    await folders.remove(target);
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
