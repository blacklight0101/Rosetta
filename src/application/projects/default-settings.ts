import type { DefaultRoles } from './default-roles.js';
import type { ProjectSettings } from './project-settings.js';
import { ROLE_NAMES } from './project-settings.js';

// RF-010, DEC-106, data-model.md section 3.1: the settings of a new project are the template, with
// the provider and model of each role taken from the server's `defaultRoles` where set. Only the
// providers the roles use are kept, and the reader decides the parallelism: 1 for Ollama (one
// local GPU), the template's value otherwise.

/** RF-401, Q-44: the context size the administrator chose goes to every Ollama provider entry. */
function withContextSize(
  providers: ProjectSettings['providers'],
  contextTokens: DefaultRoles['ollamaContextTokens'],
): ProjectSettings['providers'] {
  if (contextTokens === undefined) return providers;
  return Object.fromEntries(
    Object.entries(providers).map(([name, provider]) => [
      name,
      provider.kind === 'ollama' ? { ...provider, contextTokens } : provider,
    ]),
  );
}

/** The template with the server's default models applied; the caller validates the result. */
export function settingsForNewProject(
  template: ProjectSettings,
  defaultRoles: DefaultRoles,
): ProjectSettings {
  const roles = {
    reader: { ...template.roles.reader, ...defaultRoles.reader },
    verifier: { ...template.roles.verifier, ...defaultRoles.verifier },
    planner: { ...template.roles.planner, ...defaultRoles.planner },
    summariser: { ...template.roles.summariser, ...defaultRoles.summariser },
  };
  const used = new Set(ROLE_NAMES.map((role) => roles[role].provider));
  const providers = Object.fromEntries(
    Object.entries(template.providers).filter(([name]) => used.has(name)),
  );
  const sized = withContextSize(providers, defaultRoles.ollamaContextTokens);
  const readerProvider = roles.reader.provider;
  const readerKind = Object.hasOwn(providers, readerProvider)
    ? providers[readerProvider]?.kind
    : undefined;
  return {
    ...template,
    providers: sized,
    roles,
    agents: {
      ...template.agents,
      parallelism: readerKind === 'ollama' ? 1 : template.agents.parallelism,
    },
  };
}
