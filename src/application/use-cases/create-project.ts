import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  parseGitHubUrl,
  repositoryUrl,
  type GitHubRepoRef,
  type GitHubUrlProblem,
} from '../../domain/sources/github-repo-ref.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProjectRepository, StoredProject } from '../ports/project-repository.js';
import type { ServerSettings } from '../ports/server-settings.js';
import { settingsForNewProject } from '../projects/default-settings.js';
import type { Project } from '../projects/project.js';
import { parseProjectSettings, type ProjectSettings } from '../projects/project-settings.js';

// RF-010, DEC-48, DEC-106: Create project parses the GitHub address (no network call), stores a
// project in the user's workspace with the template's settings and the server's default models,
// and returns the user's existing project when the same address, ref and subpath is already there.

export interface CreateProjectRequest {
  readonly actor: Actor;
  /** The address as typed. */
  readonly url: string;
}

export interface UrlRefusal {
  readonly code: typeof ERROR_CODES.githubUrlInvalid;
  readonly reason: GitHubUrlProblem;
}

export interface CreateProjectDependencies {
  readonly projects: ProjectRepository;
  readonly serverSettings: ServerSettings;
  /** The validated default settings (`templates/`). */
  readonly template: ProjectSettings;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

function sourceOf(ref: GitHubRepoRef): Pick<Project, 'name' | 'sourceUrl' | 'ref' | 'subpath'> {
  return {
    name: `${ref.owner}/${ref.repo}`,
    sourceUrl: repositoryUrl({ owner: ref.owner.toLowerCase(), repo: ref.repo.toLowerCase() }),
    ref: ref.ref ?? '',
    subpath: ref.subpath ?? '',
  };
}

export class CreateProject {
  private readonly deps: CreateProjectDependencies;

  constructor(deps: CreateProjectDependencies) {
    this.deps = deps;
  }

  // RF-010
  async execute(request: CreateProjectRequest): Promise<Result<StoredProject, UrlRefusal>> {
    const parsed = parseGitHubUrl(request.url);
    if (!parsed.ok) return err({ code: ERROR_CODES.githubUrlInvalid, reason: parsed.error });
    const { ids, clock, projects } = this.deps;
    const now = clock.now().getTime();
    const project: Project = {
      id: ids.uuid(),
      userId: request.actor.userId,
      ...sourceOf(parsed.value),
      settings: await this.newSettings(),
      createdAt: now,
      updatedAt: now,
    };
    return ok(await projects.insertOrFind(project));
  }

  private async newSettings(): Promise<ProjectSettings> {
    const defaults = await this.deps.serverSettings.defaultRoles();
    const settings = parseProjectSettings(settingsForNewProject(this.deps.template, defaults));
    if (!settings.ok) {
      // The template and the server defaults are checked at start-up and on save; reaching this
      // is a configuration fault, never the user's input.
      throw new RosettaError(
        ERROR_CODES.configurationInvalid,
        `The default project settings are invalid: ${settings.error.map((problem) => problem.field).join(', ')}`,
      );
    }
    return settings.value;
  }
}
