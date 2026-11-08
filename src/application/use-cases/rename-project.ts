import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import { parseProjectName } from '../projects/project-name.js';
import type { Project } from '../projects/project.js';

// RF-010, RF-1105, P8-134, DEC-222: Rename project, from the row menu of the projects list. The
// owner check comes first, so another user's project id is "not found" like an unknown one whatever
// the name; the name is then checked by the rule of creation (RST-2000), and only the name and the
// update time are stored. A refusal writes nothing.

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
    const { projects, clock } = this.deps;
    const userId = request.actor.userId;
    const owned = await projects.find(userId, request.projectId);
    if (owned === undefined) return err(ERROR_CODES.notFound);
    const name = parseProjectName(request.name);
    if (!name.ok) return name;
    const renamed = await projects.rename({
      userId,
      projectId: owned.id,
      name: name.value,
      updatedAt: clock.now().getTime(),
    });
    // Removed between the two steps: the same answer as an unknown id.
    return renamed === undefined ? err(ERROR_CODES.notFound) : ok(renamed);
  }
}
