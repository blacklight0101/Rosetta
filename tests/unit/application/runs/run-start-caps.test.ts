import { expect, it } from 'vitest';
import type { KeyChoiceRequest } from '../../../../src/application/ports/key-source-lookup.js';
import {
  StartCaps,
  type StartCapsDependencies,
} from '../../../../src/application/runs/run-start-caps.js';
import type { KeySource } from '../../../../src/domain/budget/price-table.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import { sampleProject, templateSettings } from '../../../support/project-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';

// RF-1106, RF-1104, DEC-107: what a run's start caps are, read from the project, the account, the
// server caps and the key each role of the run would use (the same choice the provider factory makes).

const settings = structuredClone(templateSettings);
settings.budget.run.maxCostMicros = 5_000_000;
const anthropic = settings.providers['anthropic'];
if (anthropic !== undefined) anthropic.keySource = 'user-then-server';
const project = sampleProject({ settings });
const reader = sampleManifest().roles['reader'];
if (reader === undefined) throw new Error('the manifest fixture has no reader role');
const anthropicReader = { ...reader, provider: 'anthropic', kind: 'anthropic' as const };

function dependencies(keySource: KeySource, asked: KeyChoiceRequest[] = []): StartCapsDependencies {
  return {
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
    keys: {
      keySourceOf: (request) => {
        asked.push(request);
        return Promise.resolve(keySource);
      },
    },
  };
}

it('RF-1106 an understand run on server keys starts with the administrator run cap, named as such', async () => {
  const asked: KeyChoiceRequest[] = [];
  const manifest = sampleManifest({ stage: 'understand', roles: { reader: anthropicReader } });

  const caps = await new StartCaps(dependencies('server', asked)).of(
    sampleRun({ stage: 'understand' }),
    manifest,
  );

  expect(caps).toMatchObject({
    keySource: 'server',
    run: { maxCostMicros: 500_000n, source: 'administrator' },
  });
  expect(asked).toEqual([
    expect.objectContaining({
      kind: 'anthropic',
      keySource: 'user-then-server',
      serverKeysAllowed: true,
    }),
  ]);
});

it('RF-1106 an understand run on the own key starts with the project run cap and no administrator figure', async () => {
  const manifest = sampleManifest({ stage: 'understand', roles: { reader: anthropicReader } });

  const caps = await new StartCaps(dependencies('user')).of(
    sampleRun({ stage: 'understand' }),
    manifest,
  );

  expect(caps).toEqual({
    keySource: 'user',
    run: { maxCostMicros: 5_000_000n, source: 'project' },
  });
});

it('RF-1106 a scan makes no model call, so it has no key and starts with the project run cap', async () => {
  const asked: KeyChoiceRequest[] = [];

  const caps = await new StartCaps(dependencies('server', asked)).of(
    sampleRun({ stage: 'scan' }),
    sampleManifest(),
  );

  expect(caps).toEqual({
    keySource: 'none',
    run: { maxCostMicros: 5_000_000n, source: 'project' },
  });
  expect(asked).toEqual([]);
});

it('RF-1106 a run whose project is unknown has no start caps to record', async () => {
  const missing: StartCapsDependencies = {
    ...dependencies('server'),
    projects: { find: () => Promise.resolve(undefined) },
  };

  const caps = await new StartCaps(missing).of(
    sampleRun({ stage: 'understand' }),
    sampleManifest(),
  );

  expect(caps).toBeUndefined();
});
