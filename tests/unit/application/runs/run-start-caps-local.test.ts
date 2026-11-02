import { expect, it } from 'vitest';
import { StartCaps } from '../../../../src/application/runs/run-start-caps.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { sampleProject, templateSettings } from '../../../support/project-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';

// RF-433, RF-1106, P8-04: `run.started` records the run cap the guard holds the run to. An all-local
// run with "No cap for local models" is held to the administrator ceiling, not the project's cap.

function settingsOf(noCapForLocalModels: boolean): ProjectSettings {
  const settings = structuredClone(templateSettings);
  settings.budget.run = { maxCostMicros: 500_000, maxTokens: 2_000_000 };
  settings.budget.noCapForLocalModels = noCapForLocalModels;
  return settings;
}

function startCaps(settings: ProjectSettings, ollamaHost?: string): StartCaps {
  const project = sampleProject({ settings });
  return new StartCaps({
    projects: { find: () => Promise.resolve(project) },
    users: { findById: () => Promise.resolve(sampleAccount({ serverKeysAllowed: true })) },
    serverSettings: {
      caps: () =>
        Promise.resolve({
          runMicros: 500_000n,
          userDayMicros: 1_000_000n,
          serverMonthMicros: 10_000_000n,
        }),
    },
    keys: { keySourceOf: () => Promise.resolve('none') },
    ...(ollamaHost === undefined ? {} : { ollamaHost }),
  });
}

const run = sampleRun({ stage: 'understand' });
const manifest = sampleManifest({ stage: 'understand' });

it('RF-433 starts an all-local run with the setting on at the administrator ceiling', async () => {
  const caps = await startCaps(settingsOf(true), 'localhost').of(run, manifest);

  expect(caps).toEqual({
    keySource: 'none',
    run: { maxCostMicros: 100_000_000n, source: 'administrator' },
  });
});

it('RF-433 starts an all-local run with the setting off at the project cap', async () => {
  const caps = await startCaps(settingsOf(false), 'localhost').of(run, manifest);

  expect(caps).toEqual({ keySource: 'none', run: { maxCostMicros: 500_000n, source: 'project' } });
});

it('RF-433 starts a run on Ollama at a remote host at the project cap', async () => {
  const caps = await startCaps(settingsOf(true), 'ollama.example.org').of(run, manifest);

  expect(caps).toEqual({ keySource: 'none', run: { maxCostMicros: 500_000n, source: 'project' } });
});
