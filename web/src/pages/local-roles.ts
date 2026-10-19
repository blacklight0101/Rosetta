import type { ProjectSettings } from '../api/project-schemas.js';
import { providerDefaults } from './provider-choices.js';

// RF-132: the settings of a project with every role on the Ollama provider, the way out of the
// private-code notice. A role already on Ollama keeps its model; any other gets the default local
// model of templates/project-settings.json. Everything else in the document stays as it is.

const LOCAL_MODEL = 'gemma4:e4b';

/** The project settings with the reader, verifier, planner and summariser on Ollama. */
// RF-132
export function settingsOnOllama(settings: ProjectSettings): ProjectSettings {
  const ollama = settings.providers['ollama'] ?? providerDefaults['ollama'];
  const local = <Role extends { readonly provider: string; readonly model: string }>(
    role: Role,
  ): Role => ({
    ...role,
    provider: 'ollama',
    model: role.provider === 'ollama' ? role.model : LOCAL_MODEL,
  });
  const { reader, verifier, planner, summariser } = settings.roles;
  return {
    ...settings,
    providers: ollama === undefined ? settings.providers : { ...settings.providers, ollama },
    roles: {
      ...settings.roles,
      ...{ reader: local(reader), verifier: local(verifier) },
      ...{ planner: local(planner), summariser: local(summariser) },
    },
  };
}
