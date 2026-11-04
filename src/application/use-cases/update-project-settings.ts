import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { FieldProblem } from '../../domain/errors/field-problems.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Clock } from '../ports/clock.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { Project } from '../projects/project.js';
import type { ModelList } from '../models/model-list.js';
import { parseProjectSettings, type ProjectSettings } from '../projects/project-settings.js';

// RF-002, RF-405, RF-1105: Update project settings checks the document against the settings schema
// and replaces the project's settings. The owner check comes first, so another user's project id
// is answered "not found" whatever the document holds; an invalid document changes nothing and each
// problem comes back with its field and code. A save that names the version it started from is
// refused with RST-1007 when the settings were saved since (P1-106); the version test comes after
// the owner check, so another user's project is still "not found" (RF-1105). A save that moves the
// reader from a local provider to a hosted one raises a parallelism of 1 that was already stored
// to the template default; any value the user chose is kept (RF-436, P8-56).

export type UpdateSettingsRefusal =
  | { readonly code: typeof ERROR_CODES.notFound }
  | { readonly code: typeof ERROR_CODES.settingsVersionStale }
  | {
      readonly code: typeof ERROR_CODES.settingsInvalid;
      readonly problems: readonly FieldProblem[];
    };

/** RF-436: the answer of a save that raised the parallel readers because the reader went hosted. */
interface ParallelismChange {
  readonly from: number;
  readonly to: number;
}

export interface SavedSettings {
  readonly project: Project;
  /** Set only when the save changed `agents.parallelism` by the provider-switch rule. */
  readonly parallelismChange?: ParallelismChange;
}

/** The template's `agents.parallelism` (templates/project-settings.json), checked by a unit test. */
export const HOSTED_READER_PARALLELISM = 4;

function readerKind(settings: ProjectSettings): string | undefined {
  const name = settings.roles.reader.provider;
  return Object.hasOwn(settings.providers, name) ? settings.providers[name]?.kind : undefined;
}

/** RF-436: the settings to store, and the change made to them when the provider-switch rule fired. */
function applyProviderSwitchRule(
  before: ProjectSettings,
  sent: ProjectSettings,
): { readonly settings: ProjectSettings; readonly change?: ParallelismChange } {
  const leftLocal = readerKind(before) === 'ollama' && readerKind(sent) !== 'ollama';
  const untouched = before.agents.parallelism === 1 && sent.agents.parallelism === 1;
  if (!leftLocal || !untouched) return { settings: sent };
  return {
    settings: { ...sent, agents: { ...sent.agents, parallelism: HOSTED_READER_PARALLELISM } },
    change: { from: 1, to: HOSTED_READER_PARALLELISM },
  };
}

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
  /** The shipped model list: the top of each role's output limit (DEC-163). */
  readonly models: ModelList;
}

export class UpdateProjectSettings {
  private readonly deps: UpdateProjectSettingsDependencies;

  constructor(deps: UpdateProjectSettingsDependencies) {
    this.deps = deps;
  }

  // RF-002
  async execute(
    request: UpdateProjectSettingsRequest,
  ): Promise<Result<SavedSettings, UpdateSettingsRefusal>> {
    const { projects, clock, models } = this.deps;
    const { userId } = request.actor;
    const existing = await projects.find(userId, request.projectId);
    if (existing === undefined) return err({ code: ERROR_CODES.notFound });
    const parsed = parseProjectSettings(request.settings, models);
    if (!parsed.ok) return err({ code: ERROR_CODES.settingsInvalid, problems: parsed.error });
    const rule = applyProviderSwitchRule(existing.settings, parsed.value);
    const updated = await projects.updateSettings({
      userId,
      projectId: request.projectId,
      settings: rule.settings,
      updatedAt: clock.now().getTime(),
      expectedVersion: request.expectedVersion,
    });
    if (updated.kind === 'updated') {
      return ok({
        project: updated.project,
        ...(rule.change === undefined ? {} : { parallelismChange: rule.change }),
      });
    }
    return err({
      code: updated.kind === 'stale' ? ERROR_CODES.settingsVersionStale : ERROR_CODES.notFound,
    });
  }
}
