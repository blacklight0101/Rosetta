import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';
import type { Project } from '../projects/project.js';

// RF-1008, RF-1012, RF-1105: stub, replaced by the implementation in the next commit.

export interface HistoryRun {
  readonly run: Run;
  readonly sizeBytes: number;
}

export interface RunHistory {
  readonly project: Project;
  readonly runs: readonly HistoryRun[];
  readonly sizeBytes: number;
}

export interface ListHistoryDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
}

export class ListHistory {
  constructor(deps: ListHistoryDependencies) {
    void deps;
  }

  execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<RunHistory, typeof ERROR_CODES.notFound>> {
    void request;
    return Promise.resolve(err(ERROR_CODES.notFound));
  }
}
