import type { ProjectSettings } from '../api/project-schemas.js';
import { settingsOnOllama } from './local-roles.js';
import { recommendedModel, type ModelListState } from './model-lists.js';
import { ROLE_NAMES, providersOf, type RoleName } from './project-settings-form.js';

// RF-436, P8-75: the settings the start-page warning saves when "Apply to every role" is pressed.
// The start page holds no roles of its own, so the choice goes to the project settings: the four
// roles take the provider, a model chosen in the control or else the one choosing the provider for
// that role alone selects (P8-72), and every other setting stays. Ollama has no recommended model,
// so with no model chosen it switches the way the private-code notice does (RF-132).

/** The provider of the every-role control and its model; an empty model means "recommended per role". */
export interface EveryRoleChoice {
  readonly provider: string;
  readonly model: string;
}

function modelFor(
  role: RoleName,
  current: { readonly provider: string; readonly model: string },
  choice: EveryRoleChoice,
  list: ModelListState | undefined,
): string {
  if (choice.model !== '') return choice.model;
  const recommended = recommendedModel(choice.provider, list, role === 'reader');
  if (recommended !== undefined) return recommended;
  return current.provider === choice.provider ? current.model : '';
}

// RF-436
export function settingsOnEveryRole(
  settings: ProjectSettings,
  choice: EveryRoleChoice,
  list: ModelListState | undefined,
): ProjectSettings {
  if (choice.provider === 'ollama' && choice.model === '') return settingsOnOllama(settings);
  const roles = { ...settings.roles };
  for (const role of ROLE_NAMES) {
    const current = settings.roles[role];
    roles[role] = {
      ...current,
      provider: choice.provider,
      model: modelFor(role, current, choice, list),
    };
  }
  return { ...settings, providers: providersOf(settings.providers, roles), roles };
}
