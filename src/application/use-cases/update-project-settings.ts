import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { FieldProblem } from '../../domain/errors/field-problems.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Project } from '../projects/project.js';
import { parseProjectSettings } from '../projects/project-settings.js';

// RF-002, RF-405, RF-1105: Update project settings checks the document against the settings schema
// and replaces the project's settings. The owner check comes first, so another user's project id
// is answered "not found" whatever the document holds; an invalid document changes nothing and each
// problem comes back with its field and code. A save that names the version it started from is
// refused with RST-1007 when the settings were saved since (P1-106); the version test comes after
// the owner check, so another user's project is still "not found" (RF-1105).

export type UpdateSettingsRefusal =
  | { readonly code: typeof ERROR_CODES.notFound }
  | { readonly code: typeof ERROR_CODES.settingsVersionStale }
  | {
      readonly code: typeof ERROR_CODES.settingsInvalid;
      readonly problems: readonly FieldProblem[];
    };

export interface UpdateProjectSettingsRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** The document as received; parsed here. */
  readonly settings: unknown;
  /** The version of the settings the save started from; undefined saves unconditionally. */
  readonly expectedVersion?: number;
}

export interface UpdateProjectSettingsDependencies {
  readonly projects: ProjectRepository;
  readonly clock: Clock;
}

export class UpdateProjectSettings {
  private readonly deps: UpdateProjectSettingsDependencies;

  constructor(deps: UpdateProjectSettingsDependencies) {
    this.deps = deps;
  }

  // RF-002
  async execute(
    request: UpdateProjectSettingsRequest,
  ): Promise<Result<Project, UpdateSettingsRefusal>> {
    const { projects, clock } = this.deps;
    const { userId } = request.actor;
    const existing = await projects.find(userId, request.projectId);
    if (existing === undefined) return err({ code: ERROR_CODES.notFound });
    const parsed = parseProjectSettings(request.settings);
    if (!parsed.ok) return err({ code: ERROR_CODES.settingsInvalid, problems: parsed.error });
    const updated = await projects.updateSettings({
      userId,
      projectId: request.projectId,
      settings: parsed.value,
      updatedAt: clock.now().getTime(),
      expectedVersion: request.expectedVersion,
    });
    if (updated.kind === 'updated') return ok(updated.project);
    return err({
      code: updated.kind === 'stale' ? ERROR_CODES.settingsVersionStale : ERROR_CODES.notFound,
    });
  }
}
