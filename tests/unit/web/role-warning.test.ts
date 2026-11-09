import { expect, it } from 'vitest';
import { projectSchema } from '../../../web/src/api/project-schemas.js';
import type { KeyAccess } from '../../../web/src/api/schemas.js';
import type { ModelListState } from '../../../web/src/pages/model-lists.js';
import {
  problemText,
  unreachableOptions,
  unusableRoles,
  usableText,
} from '../../../web/src/pages/role-warning.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436, P8-74: the rule behind the warning of the project settings page. A role whose provider
// the user cannot use now (an Ollama that could not be reached, a provider with no key the user
// can use) is named; nothing is decided before the answers on Ollama and on keys have come.

type Provider = 'ollama' | 'openai' | 'anthropic';
type Roles = Readonly<Record<'reader' | 'verifier' | 'planner' | 'summariser', Provider>>;

function settingsOf(providers: Record<string, unknown> = {}) {
  const template = templateSettings();
  const project = projectOf('p-1', 'octo/demo', {
    settings: { ...template, providers: { ...template.providers, ...providers } },
  });
  return projectSchema.parse(project).settings;
}

const allOllama: Roles = {
  reader: 'ollama',
  verifier: 'ollama',
  planner: 'ollama',
  summariser: 'ollama',
};

const rolesOf = (roles: Roles) => ({
  reader: { provider: roles.reader },
  verifier: { provider: roles.verifier },
  planner: { provider: roles.planner },
  summariser: { provider: roles.summariser },
});

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

it('RF-436 the warning names an unreachable Ollama and the four roles that use it', () => {
  const problems = unusableRoles(
    settingsOf(),
    rolesOf(allOllama),
    access(['anthropic']),
    unreachable,
  );

  expect(problems).toEqual([
    {
      provider: 'ollama',
      reason: 'unreachable',
      roles: ['reader', 'verifier', 'planner', 'summariser'],
    },
  ]);
});

it('RF-436 the warning names a provider with no key the user can use, and only its roles', () => {
  const roles = rolesOf({ ...allOllama, planner: 'openai', verifier: 'anthropic' });

  const problems = unusableRoles(settingsOf(), roles, access([], ['anthropic']), installed);

  expect(problems).toEqual([{ provider: 'openai', reason: 'no-key', roles: ['planner'] }]);
});

it('RF-436 the warning rule: a server key counts only for a provider that may fall back to it', () => {
  const userOnly = { kind: 'anthropic', keySource: 'user', toolMode: 'native', maxRetries: 3 };
  const settings = settingsOf({ anthropic: { ...userOnly, timeoutSeconds: 120 } });
  const roles = rolesOf({ ...allOllama, reader: 'anthropic' });

  expect(unusableRoles(settings, roles, access([], ['anthropic']), installed)).toEqual([
    { provider: 'anthropic', reason: 'no-key', roles: ['reader'] },
  ]);
});

it('RF-436 the warning rule finds nothing when every role can be used', () => {
  const roles = rolesOf({ ...allOllama, planner: 'openai', reader: 'anthropic' });

  expect(unusableRoles(settingsOf(), roles, access(['openai'], ['anthropic']), installed)).toEqual(
    [],
  );
});

it('RF-436 the warning rule decides nothing before the answers on Ollama and on keys have come', () => {
  const roles = rolesOf({ ...allOllama, planner: 'openai' });
  const loading: ModelListState = { status: 'loading' };
  const failed: ModelListState = { status: 'failed' };

  expect(unusableRoles(settingsOf(), roles, undefined, loading)).toEqual([]);
  expect(unusableRoles(settingsOf(), roles, undefined, failed)).toEqual([]);
  expect(unusableRoles(settingsOf(), roles, undefined, undefined)).toEqual([]);
});

it('RF-436 the warning words for an unreachable Ollama used by all four roles', () => {
  expect(
    problemText({
      provider: 'ollama',
      reason: 'unreachable',
      roles: ['reader', 'verifier', 'planner', 'summariser'],
    }),
  ).toEqual({
    title: 'Ollama cannot be reached.',
    detail: 'All four roles use it, so a run would fail at its first call.',
  });
});

it('RF-436 the warning words for a provider with no key, used by one, two or three roles', () => {
  expect(problemText({ provider: 'openai', reason: 'no-key', roles: ['planner'] })).toEqual({
    title: 'OpenAI has no key you can use.',
    detail: 'The planner uses it, so a run would be refused (RST-2302).',
  });
  expect(
    problemText({ provider: 'anthropic', reason: 'no-key', roles: ['reader', 'verifier'] }).detail,
  ).toBe('The reader and the verifier use it, so a run would be refused (RST-2302).');
  expect(
    problemText({
      provider: 'ollama',
      reason: 'unreachable',
      roles: ['reader', 'verifier', 'summariser'],
    }).detail,
  ).toBe(
    'The reader, the verifier and the summariser use it, so a run would fail at its first call.',
  );
});

it('RF-436 the warning says what the user can use, named after the provider the control chose first', () => {
  const settings = settingsOf();

  expect(usableText(settings, 'anthropic', access(['anthropic']))).toBe(
    'You have an Anthropic key.',
  );
  expect(usableText(settings, 'openai', access([], ['openai']))).toBe(
    "You may use the server's OpenAI key.",
  );
  expect(usableText(settings, 'ollama', access([]))).toBe('Ollama can be reached.');
});

it("RF-436 the warning offers an unreachable Ollama as 'Ollama (not reachable)', which cannot be chosen", () => {
  expect(unreachableOptions(settingsOf(), unreachable)).toEqual([
    { value: 'ollama', label: 'Ollama (not reachable)', disabled: true },
  ]);
  expect(unreachableOptions(settingsOf(), installed)).toEqual([]);
});
