import { describe, expect, it } from 'vitest';
import { EstimateRun } from '../../../../src/application/estimate/estimate-run.js';
import { NO_LISTED_MODELS } from '../../../../src/application/models/model-list.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { DEEPEN_ROUNDS } from '../../../../src/domain/deepen/stop-rule.js';
import { MemoryCostTotals } from '../../../../src/infrastructure/db/memory-cost-totals.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryProviderKeyRepository } from '../../../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryRunIndex } from '../../../../src/infrastructure/db/memory-run-index.js';
import { MemoryUserRepository } from '../../../../src/infrastructure/db/memory-user-repository.js';
import { keySourceLookupOf } from '../../../../src/infrastructure/providers/key-source-lookup.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import {
  catalogAreas,
  estimatePrices,
  FixedScans,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-430, RF-431, DEC-196: the understand estimate carries the journey total the user approves, and
// a role whose provider has no usable key says the key is missing. The estimate is a pure read: it
// calls no model.

const cloud = settingsFor({
  reader: { provider: 'openai', model: 'priced-model' },
  verifier: { provider: 'openai', model: 'priced-model' },
});
const local = settingsFor({
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
  summariser: { provider: 'ollama', model: 'gemma4:e4b' },
});

async function setup(settings: ProjectSettings) {
  const projects = new MemoryProjectRepository();
  const runs = new MemoryRunIndex();
  const users = new MemoryUserRepository();
  await users.insert(sampleAccount({ id: userAmy.userId, serverKeysAllowed: true }));
  const keys = new MemoryProviderKeyRepository();
  const history = new MemoryCostTotals();
  const estimate = new EstimateRun({
    ...{ projects, runs, scans: new FixedScans(catalogAreas), keys },
    ...{ priceTable: estimatePrices, models: NO_LISTED_MODELS, reasoningModels: () => false },
    roleKeys: { users, keys: keySourceLookupOf({ keys, serverKeys: {} }) },
    history,
  });
  const project = await projectWithScan({ projects, runs }, userAmy.userId, settings);
  const run = () => estimate.execute({ actor: userAmy, projectId: project.id });
  return { project, history, run };
}

describe('RF-430 the journey total of the understand estimate', () => {
  it('RF-430 gives a likely and a worst-case total above the understand run, with the default Deepen rounds', async () => {
    const { run } = await setup(local);

    const outcome = await run();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { journey, total } = outcome.value;
    expect(journey?.basis).toBe('assumptions');
    expect(journey?.deepenRounds).toBe(DEEPEN_ROUNDS.default);
    const understandHigh = total.high.inputTokens + total.high.outputTokens;
    expect(journey?.worstCase.tokens).toBeGreaterThan(understandHigh);
    expect(journey?.likely.tokens).toBeLessThan(journey?.worstCase.tokens ?? 0);
  });

  it('RF-430 uses the measured totals of earlier runs of the same provider and model when there are any', async () => {
    const { project, history, run } = await setup(local);
    history.add({
      ...{ at: new Date('2026-10-29T10:00:00.000Z'), userId: userAmy.userId },
      ...{ projectId: project.id, runId: 'earlier', agentTaskId: null, stage: 'understand' },
      ...{ role: 'reader', provider: 'ollama', model: 'gemma4:e4b', callId: 'c1', attempt: 1 },
      ...{ keySource: 'none', inputTokens: 900_000, outputTokens: 100_000, cachedInputTokens: 0 },
      ...{ cacheWriteInputTokens: 0, usageSource: 'reported', costMicros: 0n },
      ...{ cacheWriteCostMicros: 0n, costKnown: true, currency: 'USD' },
      priceTableVersion: '2026-10-11',
    });

    const outcome = await run();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.journey?.basis).toBe('history');
    expect(outcome.value.journey?.likely.tokens).toBe(1_000_000);
  });
});

describe('RF-431 the estimate shows a missing key', () => {
  it('RF-431 a cloud role with no user key and no server key says the key is missing', async () => {
    const { run } = await setup(cloud);

    const outcome = await run();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const reader = outcome.value.roles.find((role) => role.role === 'reader');
    expect(reader?.keyMissing).toBe(true);
  });

  it('RF-431 a local role never says the key is missing', async () => {
    const { run } = await setup(local);

    const outcome = await run();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.roles.every((role) => role.keyMissing === undefined)).toBe(true);
  });
});
