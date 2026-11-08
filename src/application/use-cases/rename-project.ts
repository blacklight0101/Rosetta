import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, type Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Project } from '../projects/project.js';

// RF-010, P8-134: Rename project (not built yet).

export interface RenameProjectRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** The name as typed. */
  readonly name: string;
}

export type RenameRefusal = typeof ERROR_CODES.notFound | typeof ERROR_CODES.requestInvalid;

export interface RenameProjectDependencies {
  readonly projects: ProjectRepository;
  readonly clock: Clock;
}

export class RenameProject {
  private readonly deps: RenameProjectDependencies;

  constructor(deps: RenameProjectDependencies) {
    this.deps = deps;
  }

  // RF-010
  async execute(request: RenameProjectRequest): Promise<Result<Project, RenameRefusal>> {
    await this.deps.projects.find(request.actor.userId, request.projectId);
    return err(ERROR_CODES.notFound);
  }
}
