import type { Actor } from '../../domain/accounts/actor.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Project } from '../projects/project.js';

// RF-010, RF-1105: List projects returns the signed-in user's projects, newest first, and no one
// else's.

export interface ListProjectsDependencies {
  readonly projects: ProjectRepository;
}

export class ListProjects {
  private readonly deps: ListProjectsDependencies;

  constructor(deps: ListProjectsDependencies) {
    this.deps = deps;
  }

  // RF-010
  execute(request: { readonly actor: Actor }): Promise<readonly Project[]> {
    return this.deps.projects.list(request.actor.userId);
  }
}
