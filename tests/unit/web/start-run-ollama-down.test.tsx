import { screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { json, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';
import { estimatePath, projectPath } from './start-run-fixtures.js';
import { ready, renderStart, start } from './start-run-helpers.js';
import { oneCloudRole, uploadProjectAnswer } from './start-run-private-fixtures.js';

// RF-434, RF-436, P9-09, EV-103: while the page knows that Ollama cannot be reached, it offers
// only what can work: Analyse is off with its reason when every role is on a provider that cannot
// answer, and "Switch every role to Ollama" is not offered.

afterEach(() => {
  window.history.pushState({}, '', '/');
});

const installed = json(200, {
  provider: 'ollama',
  models: [{ model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true }],
});
const unreachable = json(200, {
  provider: 'ollama',
  models: [],
  reason: 'Ollama could not be reached.',
});
const keys = (openai: boolean) =>
  json(200, {
    providers: ['anthropic', 'openai', 'openai-compatible'].map((provider) => ({
      provider,
      ownKey: openai && provider === 'openai',
      serverKey: false,
    })),
  });
const noKeys = keys(false);
const switchName = /every role to Ollama/u;
const reasonText =
  'Every role uses a provider that cannot answer now, so a run would fail at its first call. Fix the roles above first.';

/** The template project (every role on Ollama) with the given roles moved to OpenAI. */
function withOpenAiRoles(roles: readonly string[]): Answer {
  const settings = templateSettings();
  const openai = { ...settings.providers.ollama, kind: 'openai', keySource: 'user-then-server' };
  const moved = Object.fromEntries(
    roles.map((role) => [
      role,
      { ...Reflect.get(settings.roles, role), provider: 'openai', model: 'gpt-5-nano' },
    ]),
  );
  return json(
    200,
    projectOf('p-1', 'octo/demo', {
      settings: {
        ...settings,
        providers: { ollama: settings.providers.ollama, openai },
        roles: { ...settings.roles, ...moved },
      },
    }),
  );
}

const answers = (ollama: Answer, extra: Readonly<Record<string, Answer>> = {}) => ({
  'GET /api/models/ollama': ollama,
  'GET /api/account/key-access': noKeys,
  ...extra,
});

it('RF-434 Analyse is disabled with its reason while every role uses an Ollama that cannot be reached', async () => {
  renderStart(answers(unreachable));
  await ready();

  await waitFor(() => {
    expect(start().disabled).toBe(true);
  });
  expect(start().title).toBe(reasonText);
  expect(start().textContent).toBe('Analyse');
  expect(screen.getByTestId('start-reason').textContent).toBe(reasonText);
});

it('RF-434 Analyse is available when Ollama answers, or when its answer has not come or failed', async () => {
  renderStart(answers(installed));
  await ready();
  await screen.findByText('Ollama can be reached.', {}, { timeout: 200 }).catch(() => undefined);
  expect(start().disabled).toBe(false);
  expect(screen.queryByTestId('start-reason')).toBeNull();
});

it('RF-434 Analyse is not held back when the answer on Ollama could not be had', async () => {
  renderStart(answers(json(500, { code: 'RST-9999', message: 'x' })));
  await ready();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(start().disabled).toBe(false);
});

it('RF-434 P9-14 Analyse is disabled when the roles an understand run calls cannot answer, whatever the planner uses', async () => {
  renderStart(
    answers(unreachable, {
      [`GET ${projectPath}`]: withOpenAiRoles(['planner']),
      'GET /api/account/key-access': keys(true),
    }),
  );
  await ready();

  await waitFor(() => {
    expect(start().disabled).toBe(true);
  });
  expect(start().title).toBe(reasonText);
});

it('RF-434 P9-14 Analyse stays available when one role an understand run calls can answer', async () => {
  renderStart(
    answers(unreachable, {
      [`GET ${projectPath}`]: withOpenAiRoles(['reader']),
      'GET /api/account/key-access': keys(true),
    }),
  );
  await ready();

  await screen.findByRole('alert');
  expect(start().disabled).toBe(false);
  expect(screen.queryByTestId('start-reason')).toBeNull();
});

it('RF-434 Analyse is disabled when an unreachable Ollama and a provider with no key cover all four roles', async () => {
  renderStart(
    answers(unreachable, {
      [`GET ${projectPath}`]: withOpenAiRoles(['reader', 'verifier', 'planner']),
    }),
  );
  await ready();

  await waitFor(() => {
    expect(start().disabled).toBe(true);
  });
  expect(start().title).toBe(reasonText);
});

const uploadAnswers = (ollama: Answer): Readonly<Record<string, Answer>> => ({
  ...answers(ollama),
  [`GET ${projectPath}`]: uploadProjectAnswer,
  [`GET ${estimatePath}`]: json(200, oneCloudRole),
});

it('RF-436 the private-code notice offers no switch to Ollama while Ollama cannot be reached', async () => {
  renderStart(uploadAnswers(unreachable));
  await ready();
  await screen.findByText(/Your code is private/u);

  await waitFor(() => {
    expect(screen.queryByRole('button', { name: switchName })).toBeNull();
  });
});

it('RF-436 the private-code notice offers the switch once Ollama answers with its models', async () => {
  renderStart(uploadAnswers(installed));
  await ready();

  expect(await screen.findByRole('button', { name: switchName })).toBeDefined();
});
