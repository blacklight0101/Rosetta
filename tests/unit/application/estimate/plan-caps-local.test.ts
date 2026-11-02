import { expect, it } from 'vitest';
import {
  planCaps,
  type PlanCapDependencies,
} from '../../../../src/application/estimate/plan-caps.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { sampleProject, templateSettings } from '../../../support/project-fixtures.js';

// RF-433, RF-613, P8-04: the plan caps list the run cap the guard holds the planner to. An all-local
// run with "No cap for local models" is held to the administrator ceiling, not the project's cap.

function settingsOf(noCapForLocalModels: boolean): ProjectSettings {
  const settings = structuredClone(templateSettings);
  settings.budget.run = { maxCostMicros: 500_000, maxTokens: 2_000_000 };
  settings.budget.noCapForLocalModels = noCapForLocalModels;
  return settings;
}

function dependencies(ollamaHost?: string): PlanCapDependencies {
  return {
    users: { findById: () => Promise.resolve(sampleAccount()) },
    serverSettings: {
      caps: () =>
        Promise.resolve({
          runMicros: 500_000_000n,
          userDayMicros: 500_000_000n,
          serverMonthMicros: 500_000_000n,
        }),
    },
    usage: {
      userDay: () => Promise.resolve({ server: [], own: [] }),
      serverMonth: () => Promise.resolve([]),
    },
    clock: new FixedClock('2026-11-02T10:00:00Z'),
    ...(ollamaHost === undefined ? {} : { ollamaHost }),
  };
}

async function runTokensCap(settings: ProjectSettings, ollamaHost?: string): Promise<bigint> {
  const project = sampleProject({ settings });
  const point = { inputTokens: 1_000, outputTokens: 1_000, costMicros: 0n };
  const { caps } = await planCaps(
    dependencies(ollamaHost),
    project,
    { keySource: 'none', points: { low: point, likely: point, high: point } },
    'planner',
  );
  const cap = caps.find((one) => one.kind === 'run-tokens');
  if (cap === undefined) throw new Error('the plan caps list no run token cap');
  return cap.limit;
}

it('RF-433 lists the administrator ceiling as the run token cap of an all-local run', async () => {
  expect(await runTokensCap(settingsOf(true), 'localhost')).toBe(50_000_000n);
});

it('RF-433 lists the project cap when the setting is off', async () => {
  expect(await runTokensCap(settingsOf(false), 'localhost')).toBe(2_000_000n);
});

it('RF-433 lists the project cap for Ollama at a remote host', async () => {
  expect(await runTokensCap(settingsOf(true), 'ollama.example.org')).toBe(2_000_000n);
});
