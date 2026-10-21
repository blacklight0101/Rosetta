import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { estimateRole } from '../../../src/application/estimate/role-estimate.js';
import { loadPriceTable } from '../../../src/infrastructure/budget/price-file.js';
import { MemoryProviderKeyRepository } from '../../../src/infrastructure/db/memory-provider-key-repository.js';
import {
  catalogAreas,
  createEstimateHarness,
  projectWithScan,
} from '../../support/estimate-harness.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { userAmy } from '../../support/run-harness.js';

// RF-420, RF-425, RF-427, Q-56: with every role on Claude Haiku 5.5 and a server key, the estimate
// prices the roles from the shipped table: dollars, no role without a price (the start page shows
// "which has no price" for such a role).

const shipped = fileURLToPath(new URL('../../../prices/default-prices.yaml', import.meta.url));
const haiku = { provider: 'anthropic', model: 'claude-haiku-5-5' };

it('RF-420 prices the reader, verifier and summariser on Haiku 5.5 from the shipped table', async () => {
  const table = await loadPriceTable(shipped);
  const harness = createEstimateHarness(catalogAreas, [], table);
  const settings = settingsFor({ reader: haiku, verifier: haiku, summariser: haiku });
  const project = await projectWithScan(harness, userAmy.userId, settings);

  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });

  if (!outcome.ok) throw new Error('The estimate failed');
  expect(outcome.value.roles.map((role) => [role.role, role.keySource, role.priced])).toEqual([
    ['reader', 'server', true],
    ['verifier', 'server', true],
    ['summariser', 'server', true],
  ]);
  for (const role of outcome.value.roles) {
    expect(role.points.likely.costMicros).toBeGreaterThan(0n);
  }
});

it('RF-420 prices the planner on Haiku 5.5 from the shipped table, by the length of its prompt', async () => {
  const pricing = {
    keys: new MemoryProviderKeyRepository(),
    priceTable: await loadPriceTable(shipped),
  };
  const project = sampleProject({
    userId: userAmy.userId,
    settings: settingsFor({ planner: haiku }),
  });
  const call = (inputTokens: number) => ({
    role: 'planner' as const,
    tokens: {
      low: { inputTokens, outputTokens: 0, cacheWriteTokens: 0, promptTokens: inputTokens },
      likely: { inputTokens, outputTokens: 0, cacheWriteTokens: 0, promptTokens: inputTokens },
      high: { inputTokens, outputTokens: 0, cacheWriteTokens: 0, promptTokens: inputTokens },
    },
  });

  const short = await estimateRole(pricing, project, call(100_000));
  const long = await estimateRole(pricing, project, call(100_001));

  expect(short.priced && long.priced).toBe(true);
  expect(short.points.likely.costMicros).toBe(10_000n);
  expect(long.points.likely.costMicros).toBe(50_001n);
});
