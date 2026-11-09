import type { ProjectSettings } from '../api/project-schemas.js';
import type { KeyAccess } from '../api/schemas.js';
import type { ModelListState } from './model-lists.js';
import { kindOfProvider, providerDefaults, providerOptions } from './provider-choices.js';

// RF-436, DEC-225, P8-73: the providers the every-role control of the project settings page lists:
// only the ones the user can use now. A provider that takes a key needs the user's own key, or the
// server's key when the provider may fall back to it (`keySource` `user-then-server`) and the user
// may use it; Ollama needs to have answered with its models. The fake of the tests is never listed.

interface Option {
  readonly value: string;
  readonly label: string;
}

const keyKinds: readonly string[] = ['anthropic', 'openai', 'openai-compatible'];

/** Ollama answered the models question: a list came back with no reason it could not be asked. */
function ollamaAnswered(list: ModelListState | undefined): boolean {
  return list?.status === 'ready' && list.reason === undefined;
}

function keySourceOf(settings: ProjectSettings, provider: string): string | undefined {
  const own = Object.hasOwn(settings.providers, provider)
    ? settings.providers[provider]
    : undefined;
  return (own ?? providerDefaults[provider])?.keySource;
}

/** The names of the providers the user can use through a key, in the order of the provider list. */
export function keyedProviders(
  settings: ProjectSettings,
  access: readonly KeyAccess[],
): readonly string[] {
  const kindOf = kindOfProvider(settings);
  return providerOptions(settings)
    .map((option) => option.value)
    .filter((provider) => {
      const kind = kindOf(provider);
      const entry = access.find((each) => each.provider === kind);
      if (kind === undefined || !keyKinds.includes(kind) || entry === undefined) return false;
      return (
        entry.ownKey || (entry.serverKey && keySourceOf(settings, provider) === 'user-then-server')
      );
    });
}

// RF-436
export function everyRoleProviders(
  settings: ProjectSettings,
  access: readonly KeyAccess[],
  ollama: ModelListState | undefined,
): readonly Option[] {
  const keyed = keyedProviders(settings, access);
  const kindOf = kindOfProvider(settings);
  const reachable = ollamaAnswered(ollama);
  return providerOptions(settings).filter((option) =>
    kindOf(option.value) === 'ollama' ? reachable : keyed.includes(option.value),
  );
}
