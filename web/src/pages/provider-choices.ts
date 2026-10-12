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

/** The name a provider goes by on the pages (`openai` -> `OpenAI`); an unknown one keeps its name. */
export function providerLabel(provider: string): string {
  return providerLabels[provider] ?? provider;
}

/** Provider names for a sentence, each once: `OpenAI`, `OpenAI and Anthropic`, `A, B and C`. */
export function providerNames(providers: readonly string[]): string {
  const names = [...new Set(providers.map(providerLabel))];
  const last = names.at(-1);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${last ?? ''}`;
}

/** The providers a role or a price can name: the ones the project defines, then the others. */
export function providerOptions(
  settings: ProjectSettings,
): readonly { readonly value: string; readonly label: string }[] {
  const names = new Set([...Object.keys(settings.providers), ...Object.keys(providerDefaults)]);
  return [...names].map((value) => ({ value, label: providerLabel(value) }));
}
