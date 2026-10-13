import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';
import type { Deleted, DeleteRunProblem } from './delete-run.js';

// RF-1012, DEC-55, RF-1105: stub, replaced by the implementation in the next commit.

export interface DeleteProjectDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
  readonly logger: Logger;
}

export class DeleteProject {
  constructor(deps: DeleteProjectDependencies) {
    void deps;
  }

  execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<Deleted, DeleteRunProblem>> {
    void request;
    return Promise.resolve(err(ERROR_CODES.notFound));
  }
}
