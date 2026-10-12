import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Project } from '../projects/project.js';

// RF-1105: Get project returns one of the signed-in user's projects. Another user's id and an
// unknown id give the same answer, so the answer never says whether a project exists.

export interface GetProjectDependencies {
  readonly projects: ProjectRepository;
}

export class GetProject {
  private readonly deps: GetProjectDependencies;

  constructor(deps: GetProjectDependencies) {
    this.deps = deps;
  }

  // RF-1105
  async execute(request: {
    readonly actor: Actor;
    readonly projectId: string;
  }): Promise<Result<Project, typeof ERROR_CODES.notFound>> {
    const project = await this.deps.projects.find(request.actor.userId, request.projectId);
    return project === undefined ? err(ERROR_CODES.notFound) : ok(project);
  }
}
