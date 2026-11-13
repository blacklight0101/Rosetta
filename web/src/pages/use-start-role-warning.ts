import { useRef, useState } from 'preact/hooks';
import type { ApiClient, ApiFailure } from '../api/client.js';
import { getModelChoices } from '../api/models.js';
import type { Project } from '../api/project-schemas.js';
import { getProject, saveProjectSettings } from '../api/projects.js';
import { useApp } from '../app/app-context.js';
import { everyRoleProviders, keyedProviders } from './every-role.js';
import { settingsOnEveryRole, type EveryRoleChoice } from './every-role-settings.js';
import { hasShippedList, type ModelListState } from './model-lists.js';
import { ROLE_NAMES } from './project-settings-form.js';
import { providerLabel } from './provider-choices.js';
import { roleStates, providersDown, type ProvidersDown } from './role-state.js';
import { roleWarningOf, type RoleWarningFacts } from './role-warning.js';
import { useKeyAccess } from './use-key-access.js';
import { useModelLists } from './use-model-lists.js';
import { noticeOf } from './use-settings-editor.js';

// RF-436, P8-75: the warning of the start page on roles that cannot be used now. It follows the
// project's saved roles, as the start page has none of its own. Apply reads the project again, so
// what another session saved stays, saves the settings with every role on the chosen provider, and
// says what it saved; the warning then goes because the new roles can be used (DEC-106: nothing
// changes without that press).

export interface StartRoleWarning {
  readonly warning: RoleWarningFacts | undefined;
  readonly lists: Readonly<Record<string, ModelListState>>;
  readonly apply: (provider: string, model: string) => void;
  /** What the last Apply saved, and the parallel-readers line when that rule fired. */
  readonly saved: { readonly line: string; readonly notice: string } | undefined;
  readonly error: ApiFailure | undefined;
}

type Lists = Readonly<Record<string, ModelListState>>;

/** The provider's list for the recommended models: the one the page has, else asked for now. */
async function listFor(
  client: ApiClient,
  provider: string,
  lists: Lists,
): Promise<ModelListState | undefined> {
  const held = lists[provider];
  if (held?.status === 'ready' || !hasShippedList(provider)) return held;
  const asked = await getModelChoices(client, provider, new AbortController().signal);
  return asked.ok
    ? { status: 'ready', models: asked.value.models, reason: asked.value.reason }
    : undefined;
}

/** The warning's facts, and (P9-09) what the start page cannot offer because of them. */
export interface RoleFacts {
  readonly warning: RoleWarningFacts | undefined;
  readonly lists: Lists;
  readonly down: ProvidersDown;
}

// RF-436
export function useRoleFacts(project: Project): RoleFacts {
  const { settings } = project;
  const access = useKeyAccess();
  const roles = ROLE_NAMES.map((role) => settings.roles[role].provider);
  const lists = useModelLists([...roles, 'ollama', ...keyedProviders(settings, access ?? [])]);
  const ollama = lists['ollama'];
  const usable = everyRoleProviders(settings, access ?? [], ollama);
  return {
    warning: roleWarningOf(settings, { roles: settings.roles, access, ollama, usable }),
    lists,
    down: providersDown(roleStates(settings, settings.roles, access, ollama), ollama),
  };
}

// RF-436
export function useStartRoleWarning(
  project: Project,
  onSaved: (project: Project) => void,
  facts: RoleFacts,
): StartRoleWarning {
  const { client } = useApp();
  const { warning, lists } = facts;
  const [saved, setSaved] = useState<StartRoleWarning['saved']>();
  const [error, setError] = useState<ApiFailure | undefined>();
  const busy = useRef(false);
  const save = async (choice: EveryRoleChoice): Promise<void> => {
    busy.current = true;
    setError(undefined);
    const read = await getProject(client, project.id, new AbortController().signal);
    const list = read.ok ? await listFor(client, choice.provider, lists) : undefined;
    const result = read.ok
      ? await saveProjectSettings(
          client,
          read.value,
          settingsOnEveryRole(read.value.settings, choice, list),
        )
      : read;
    busy.current = false;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const line = `Saved in the project settings: every role now uses ${providerLabel(choice.provider)}.`;
    setSaved({ line, notice: noticeOf(result.value.parallelismChange) });
    onSaved(result.value);
  };
  const apply = (provider: string, model: string): void => {
    if (!busy.current) void save({ provider, model });
  };
  return { warning, lists, apply, saved, error };
}
