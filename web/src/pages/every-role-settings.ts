import type { ProjectSettings } from '../api/project-schemas.js';
import type { ModelListState } from './model-lists.js';

// RF-436, P8-75: the settings the start-page warning saves when "Apply to every role" is pressed.

// RF-436
export function settingsOnEveryRole(
  settings: ProjectSettings,
  choice: { readonly provider: string; readonly model: string },
  list: ModelListState | undefined,
): ProjectSettings {
  return list === undefined && choice.provider === '' ? settings : { ...settings };
}
