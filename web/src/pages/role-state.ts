import type { ProjectSettings } from '../api/project-schemas.js';
import type { KeyAccess } from '../api/schemas.js';
import { keyedProviders } from './every-role.js';
import type { ModelListState } from './model-lists.js';
import type { RoleName } from './project-settings-form.js';
import { kindOfProvider } from './provider-choices.js';

// RF-436, P8-135: the State column of the Roles table, by the rule of the warning (P8-74). A role
// whose provider takes a key is ready when the user has a key they can use for it (DEC-225); a role
// on Ollama is ready when Ollama answered with its models. Nothing is said before the answer the
// state rests on has come or when it could not be had, nor for a provider that is neither (the fake).

export type RoleState = 'key-ready' | 'no-key' | 'reachable' | 'not-reachable';

const keyKinds: readonly string[] = ['anthropic', 'openai', 'openai-compatible'];

/** What Ollama's answer to the models question says, once it has come. */
function ollamaState(list: ModelListState | undefined): RoleState | undefined {
  if (list?.status !== 'ready') return undefined;
  return list.reason === undefined ? 'reachable' : 'not-reachable';
}

// RF-436
export function roleStates(
  settings: ProjectSettings,
  roles: Readonly<Record<RoleName, { readonly provider: string }>>,
  access: readonly KeyAccess[] | undefined,
  ollama: ModelListState | undefined,
): Readonly<Record<RoleName, RoleState | undefined>> {
  const kindOf = kindOfProvider(settings);
  const keyed = access === undefined ? undefined : keyedProviders(settings, access);
  const ollamaNow = ollamaState(ollama);
  const stateOf = (provider: string): RoleState | undefined => {
    const kind = kindOf(provider);
    if (kind === 'ollama') return ollamaNow;
    if (kind === undefined || !keyKinds.includes(kind) || keyed === undefined) return undefined;
    return keyed.includes(provider) ? 'key-ready' : 'no-key';
  };
  return {
    reader: stateOf(roles.reader.provider),
    verifier: stateOf(roles.verifier.provider),
    planner: stateOf(roles.planner.provider),
    summariser: stateOf(roles.summariser.provider),
  };
}

/** P9-09: what the start page cannot offer because of the answers it has on its roles. */
export interface ProvidersDown {
  /** Ollama answered that it could not be reached, so a switch to it cannot work. */
  readonly ollama: boolean;
  /** Every role is on a provider that cannot answer, and one of them is an unreachable Ollama. */
  readonly everyRole: boolean;
}

// RF-434, RF-436
export function providersDown(
  states: Readonly<Record<RoleName, RoleState | undefined>>,
  ollama: ModelListState | undefined,
): ProvidersDown {
  const all = Object.values(states);
  const cannot = (state: RoleState | undefined): boolean =>
    state === 'not-reachable' || state === 'no-key';
  return {
    ollama: ollamaState(ollama) === 'not-reachable',
    everyRole: all.every(cannot) && all.includes('not-reachable'),
  };
}
