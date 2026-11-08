import { expect, it } from 'vitest';
import { projectSchema } from '../../../web/src/api/project-schemas.js';
import type { KeyAccess } from '../../../web/src/api/schemas.js';
import type { ModelListState } from '../../../web/src/pages/model-lists.js';
import { roleStates } from '../../../web/src/pages/role-state.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436, P8-135: the State column of the Roles table. A role's provider is ready (a key the user
// can use, an Ollama that answered with its models) or not (no such key, an Ollama that could not
// be reached), by the rule of the warning (P8-74); nothing is said before the answer it rests on.

type Provider = 'ollama' | 'openai' | 'anthropic' | 'openai-compatible' | 'fake';
type Roles = Readonly<Record<'reader' | 'verifier' | 'planner' | 'summariser', Provider>>;

const settings = projectSchema.parse(
  projectOf('p-1', 'octo/demo', { settings: templateSettings() }),
).settings;

const rolesOf = (roles: Roles) => ({
  reader: { provider: roles.reader },
  verifier: { provider: roles.verifier },
  planner: { provider: roles.planner },
  summariser: { provider: roles.summariser },
});

const allOllama: Roles = {
  reader: 'ollama',
  verifier: 'ollama',
  planner: 'ollama',
  summariser: 'ollama',
};

const unreachable: ModelListState = {
  status: 'ready',
  models: [],
  reason: 'Ollama could not be reached.',
};
const installed: ModelListState = {
  status: 'ready',
  models: [{ model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true }],
  reason: undefined,
};

function access(own: readonly string[], server: readonly string[] = []): readonly KeyAccess[] {
  return (['anthropic', 'openai', 'openai-compatible'] as const).map((provider) => ({
    provider,
    ownKey: own.includes(provider),
    serverKey: server.includes(provider),
  }));
}

it('RF-436 an Ollama that could not be reached reads Not reachable on every role that uses it', () => {
  expect(roleStates(settings, rolesOf(allOllama), access([]), unreachable)).toEqual({
    reader: 'not-reachable',
    verifier: 'not-reachable',
    planner: 'not-reachable',
    summariser: 'not-reachable',
  });
});

it('RF-436 an Ollama that answered with its models reads Reachable', () => {
  expect(roleStates(settings, rolesOf(allOllama), access([]), installed).reader).toBe('reachable');
});

it('RF-436 a role on a keyed provider reads Key ready with my key or a server key I may use, else No key', () => {
  const roles = rolesOf({
    reader: 'anthropic',
    verifier: 'openai',
    planner: 'openai-compatible',
    summariser: 'ollama',
  });
  // The server key counts only for a provider that may fall back to it (`user-then-server`):
  // OpenAI-compatible takes the user's key alone (providerDefaults).
  expect(
    roleStates(settings, roles, access(['anthropic'], ['openai', 'openai-compatible']), installed),
  ).toEqual({
    reader: 'key-ready',
    verifier: 'key-ready',
    planner: 'no-key',
    summariser: 'reachable',
  });
  expect(roleStates(settings, roles, access([]), installed).verifier).toBe('no-key');
});

it('RF-436 nothing is said before the answer a role rests on has come, or when it could not be had', () => {
  const roles = rolesOf({
    reader: 'anthropic',
    verifier: 'ollama',
    planner: 'fake',
    summariser: 'ollama',
  });
  expect(roleStates(settings, roles, undefined, { status: 'loading' })).toEqual({
    reader: undefined,
    verifier: undefined,
    planner: undefined,
    summariser: undefined,
  });
  expect(roleStates(settings, roles, undefined, { status: 'failed' }).verifier).toBeUndefined();
  // The Ollama answer does not wait for the keys, and the keys do not wait for Ollama.
  expect(roleStates(settings, roles, undefined, unreachable).verifier).toBe('not-reachable');
  expect(roleStates(settings, roles, access(['anthropic']), undefined).reader).toBe('key-ready');
  // The fake of the tests takes no key and is not Ollama: it never has a State.
  expect(roleStates(settings, roles, access(['anthropic']), installed).planner).toBeUndefined();
});
