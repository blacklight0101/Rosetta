import type { ProjectSettings, ProviderSettings } from '../api/project-schemas.js';

// RF-002, P1-41: the providers a role or a price override can name on the project settings page.

/** What a provider the project does not define yet starts with (templates/project-settings.json). */
export const providerDefaults: Readonly<Record<string, ProviderSettings>> = {
  ollama: {
    kind: 'ollama',
    keySource: 'user-then-server',
    toolMode: 'native',
    timeoutSeconds: 120,
    maxRetries: 3,
    contextTokens: 'auto',
  },
  openai: {
    kind: 'openai',
    keySource: 'user-then-server',
    toolMode: 'native',
    timeoutSeconds: 120,
    maxRetries: 3,
  },
  anthropic: {
    kind: 'anthropic',
    keySource: 'user-then-server',
    toolMode: 'native',
    timeoutSeconds: 120,
    maxRetries: 3,
  },
  'openai-compatible': {
    kind: 'openai-compatible',
    keySource: 'user',
    toolMode: 'native',
    timeoutSeconds: 120,
    maxRetries: 3,
  },
  fake: {
    kind: 'fake',
    keySource: 'user',
    toolMode: 'native',
    timeoutSeconds: 120,
    maxRetries: 3,
  },
};

const providerLabels: Readonly<Record<string, string>> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  'openai-compatible': 'OpenAI-compatible',
  fake: 'Fake (tests)',
};

/** The providers a role or a price can name: the ones the project defines, then the others. */
export function providerOptions(
  settings: ProjectSettings,
): readonly { readonly value: string; readonly label: string }[] {
  const names = new Set([...Object.keys(settings.providers), ...Object.keys(providerDefaults)]);
  return [...names].map((value) => ({ value, label: providerLabels[value] ?? value }));
}

/** DEC-106: the providers an administrator can make the default of a role for new projects. */
export const defaultModelProviders: readonly { readonly value: string; readonly label: string }[] =
  ['ollama', 'openai', 'anthropic', 'openai-compatible'].map((value) => ({
    value,
    label: providerLabels[value] ?? value,
  }));
