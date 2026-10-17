import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { serverKeyText } from '../../support/provider-factory-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarnessOptions,
} from '../../support/understand-run-harness.js';

// RF-250, RF-401, RF-405, RF-427, RF-423: the summariser is a role of an understand run like the
// reader. A summariser that cannot be served, is not ready or has no price stops the run before any
// call; a cap of its own refuses its calls without stopping the run.

const temp = useTempRoot('rosetta-understand-summariser-');

const ollama = {
  kind: 'ollama',
  keySource: 'user',
  toolMode: 'native',
  timeoutSeconds: 10,
  maxRetries: 0,
} as const;

function withSummariser(provider: string, model: string): ProjectSettings {
  return understandSettings((settings) => ({
    ...settings,
    providers: { ...settings.providers, ollama },
    roles: { ...settings.roles, summariser: { ...settings.roles.summariser, provider, model } },
  }));
}

async function runOf(options: Partial<UnderstandHarnessOptions>, areas?: readonly string[]) {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-consolidate.json',
    ...options,
  });
  await h.scan();
  const run = await h.understand({ cloudConsent: true, ...(areas === undefined ? {} : { areas }) });
  return { h, run };
}

describe('an understand run whose summariser cannot start', UNDERSTAND_TIMEOUT, () => {
  it('RF-427 an unpriced summariser on a server key stops the run before any call', async () => {
    const settings = understandSettings((base) => ({
      ...base,
      roles: {
        ...base.roles,
        summariser: { ...base.roles.summariser, provider: 'openai', model: 'unlisted-model' },
      },
      budget: { ...base.budget, allowUnpriced: true },
    }));

    const { h, run } = await runOf({
      settings,
      openAiKey: { of: 'server', key: serverKeyText },
    });

    expect(run.endState).toBe('Failed');
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.modelUnpriced,
    });
    expect(h.providers.requests()).toEqual([]);
  });

  it('RF-405 a summariser with no key stops the run and the log names the role', async () => {
    const { h, run } = await runOf({ settings: withSummariser('openai', 'gpt-5-nano') });

    expect(run.endState).toBe('Failed');
    expect(h.providers.requests()).toEqual([]);
    const named = h.logger.entries.filter((entry) => entry.data?.['role'] === 'summariser');
    expect(named.map((entry) => entry.data?.['provider'])).toEqual(['openai']);
  });

  it('RF-401 an Ollama summariser that is not ready stops the run before its first task', async () => {
    const { h, run } = await runOf({
      settings: withSummariser('ollama', 'gemma4:e4b'),
      beforeCall: (call) =>
        call === 1
          ? Promise.reject(new RosettaError(ERROR_CODES.ollamaUnreachable))
          : Promise.resolve(),
    });

    expect(run.endState).toBe('Failed');
    expect((await h.manifestOf(run)).agentTasks).toEqual([]);
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.ollamaUnreachable,
    });
  });
});

describe('an understand run whose summariser has a cap of its own', UNDERSTAND_TIMEOUT, () => {
  it('RF-423 the cap refuses the summariser calls only: the readers end, the cards stay', async () => {
    const settings = understandSettings((base) => ({
      ...base,
      budget: { ...base.budget, roles: { summariser: { maxTokens: 1 } } },
    }));

    const { h, run } = await runOf({ settings });

    const roles = h.providers.requests().map((request) => request.context.role);
    expect(roles).toEqual(['reader', 'reader', 'reader', 'reader', 'reader']);
    expect(run.endState).toBe('Completed');
    const warned = h.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.code)).toContain(ERROR_CODES.budgetCapReached);
  });
});
