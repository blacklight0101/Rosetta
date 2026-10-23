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

/**
 * RF-427, P2-24: the provider kinds that bill the tokens written to a prompt cache at a price of
 * their own, so a price override for one needs a cache-write price. The price lookup keeps the same
 * list in `cacheWriteKinds` (src/domain/budget/price-table.ts), which web/ cannot import; a unit
 * test fails when the two differ.
 */
export const cacheWriteProviders: readonly string[] = ['anthropic'];

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

/** The kind of a provider entry by its name, as the server reads it (default-settings.ts). */
export function kindOfProvider(
  settings: ProjectSettings,
): (provider: string) => string | undefined {
  return (provider) => settings.providers[provider]?.kind ?? providerDefaults[provider]?.kind;
}

/** DEC-106: the providers an administrator can make the default of a role for new projects. */
export const defaultModelProviders: readonly { readonly value: string; readonly label: string }[] =
  ['ollama', 'openai', 'anthropic', 'openai-compatible'].map((value) => ({
    value,
    label: providerLabels[value] ?? value,
  }));
