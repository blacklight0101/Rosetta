import { describe, expect, it } from 'vitest';
import type { RoleEstimate } from '../../../../src/application/estimate/estimate-types.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { Price } from '../../../../src/domain/budget/price.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import {
  catalogAreas,
  createEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-425, RF-420, P2-24, P2-37: Anthropic bills the tokens it writes to its prompt cache above the
// input price. The high figure of the estimate prices the whole prompt at the highest of the input
// and the cache-write price; the low and likely figures price the tokens a task writes to the cache
// (its conversation as it stands at the last turn, because every turn writes only what the turn
// before it did not send) at the cache-write price and the rest of the prompt at the input price.
// The price table is a recorded one (Sonnet-class prices: 3, 0.30, 3.75 and 15 USD per million
// tokens).

function claude(overrides: Partial<Price> = {}): Price {
  return {
    provider: 'anthropic',
    model: 'claude-test',
    inputPerMillionMicros: 3_000_000n,
    outputPerMillionMicros: 15_000_000n,
    cachedInputPerMillionMicros: 300_000n,
    cacheWriteInputPerMillionMicros: 3_750_000n,
    currency: 'USD',
    ...overrides,
  };
}

const anthropicRoles = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-test' },
  verifier: { provider: 'anthropic', model: 'claude-test' },
  summariser: { provider: 'anthropic', model: 'claude-test' },
});

const oneTurnRoles: ProjectSettings = {
  ...anthropicRoles,
  roles: { ...anthropicRoles.roles, reader: { ...anthropicRoles.roles.reader, maxTurns: 1 } },
};

interface Estimated {
  readonly role: RoleEstimate;
  /** The tokens a reader task of the Orders area writes to the cache in each of the two figures. */
  readonly written: Readonly<Record<'low' | 'likely', number>>;
}

async function estimated(
  price: Price,
  role: RoleEstimate['role'],
  settings: ProjectSettings = anthropicRoles,
): Promise<Estimated> {
  const table: PriceTable = { version: '2026-10-11', currency: 'USD', prices: [price] };
  const harness = createEstimateHarness(catalogAreas, [], table);
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({
    actor: userAmy,
    projectId: project.id,
    areas: ['Orders'],
  });
  if (!outcome.ok) throw new Error('The estimate failed');
  const found = outcome.value.roles.find((each) => each.role === role);
  const orders = outcome.value.areas[0]?.estimatedTokens;
  if (found === undefined || orders === undefined) throw new Error('The estimate has no figures');
  const { assumptions } = outcome.value;
  const writtenIn = (scenario: 'low' | 'likely'): number => {
    const turns = assumptions.turnsPerArea[scenario];
    const before = turns - 1;
    const read = Math.floor((orders * assumptions.readSharePercent[scenario] + 99) / 100);
    const lastPrompt =
      assumptions.promptOverheadTokens +
      Math.floor((read * before) / turns) +
      assumptions.outputTokensPerTurn[scenario] * before;
    return Math.min(lastPrompt, assumptions.contextLimitTokens);
  };
  return { role: found, written: { low: writtenIn('low'), likely: writtenIn('likely') } };
}

/** The cost of a point when `written` of its input tokens are priced at the cache-write price. */
function micros(
  point: { readonly inputTokens: number; readonly outputTokens: number },
  prices: { readonly input: bigint; readonly write: bigint },
  written = 0,
): bigint {
  const total =
    BigInt(point.inputTokens - written) * prices.input +
    BigInt(written) * prices.write +
    BigInt(point.outputTokens) * 15_000_000n;
  return (total + 999_999n) / 1_000_000n;
}

const anthropicPrices = { input: 3_000_000n, write: 3_750_000n };
const plainPrices = { input: 3_000_000n, write: 3_000_000n };

describe('the estimate and Anthropic cache writes', () => {
  it('RF-425 the high figure prices the whole prompt at the cache-write price', async () => {
    const { role } = await estimated(claude(), 'reader');
    const { high } = role.points;

    expect(high.costMicros).toBe(micros(high, anthropicPrices, high.inputTokens));
  });

  it('RF-425 a task of one turn writes its whole prompt, so every figure is at the cache-write price', async () => {
    const { role } = await estimated(claude(), 'reader', oneTurnRoles);

    for (const point of [role.points.low, role.points.likely, role.points.high]) {
      expect(point.costMicros).toBe(micros(point, anthropicPrices, point.inputTokens));
    }
  });

  it('RF-425 the low and likely figures price only the conversation a task writes at the cache-write price', async () => {
    const { role, written } = await estimated(claude(), 'reader');

    for (const scenario of ['low', 'likely'] as const) {
      const point = role.points[scenario];

      expect(written[scenario]).toBeGreaterThan(0);
      expect(written[scenario]).toBeLessThan(point.inputTokens);
      expect(point.costMicros).toBe(micros(point, anthropicPrices, written[scenario]));
    }
  });

  it('RF-425 the verifier prices its share of the written tokens the same way', async () => {
    const { role } = await estimated(claude(), 'verifier');
    const { likely } = role.points;

    expect(likely.costMicros).toBeGreaterThan(micros(likely, plainPrices));
    expect(likely.costMicros).toBeLessThan(micros(likely, anthropicPrices, likely.inputTokens));
  });

  it('RF-425 a cache-write price below the input price leaves every figure at the input price', async () => {
    const lower = claude({ cacheWriteInputPerMillionMicros: 2_000_000n });
    const { role } = await estimated(lower, 'reader');

    for (const point of [role.points.low, role.points.likely, role.points.high]) {
      expect(point.costMicros).toBe(micros(point, plainPrices));
    }
  });
});
