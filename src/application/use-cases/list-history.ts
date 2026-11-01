import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';
import type { Project } from '../projects/project.js';

// RF-1008, RF-1012, RF-1105: List history gives the history page the runs of one of the signed-in
// user's projects, newest first, each with the size of its folder, and the size of the project
// folder: what a deletion would free. Another user's project id and an unknown id give the same
// answer, so the answer never says whether a project exists.

export interface HistoryRun {
  readonly run: Run;
  /** The bytes the run folder holds; 0 when it has none (a run that never wrote one). */
  readonly sizeBytes: number;
  /** EV-80: the place of a queued run in the server's queue, counted from 1; null for any other run. */
  readonly position: number | null;
}

export interface RunHistory {
  readonly project: Project;
  readonly runs: readonly HistoryRun[];
  /** The bytes the project folder holds, its run folders included. */
  readonly sizeBytes: number;
}

export interface ListHistoryDependencies {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
}

export class ListHistory {
  private readonly deps: ListHistoryDependencies;

  constructor(deps: ListHistoryDependencies) {
    this.deps = deps;
  }

  // RF-1008
  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<RunHistory, typeof ERROR_CODES.notFound>> {
    const { projects, runs, folders } = this.deps;
    const { userId } = request.actor;
    const project = await projects.find(userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const listed: HistoryRun[] = [];
    for (const run of await runs.list(userId, project.id)) {
      const sizeBytes = await folders.size({ userId, projectId: project.id, runKey: run.runKey });
      listed.push({ run, sizeBytes, position: null });
    }
    const sizeBytes = await folders.size({ userId, projectId: project.id });
    return ok({ project, runs: listed, sizeBytes });
  }
}
