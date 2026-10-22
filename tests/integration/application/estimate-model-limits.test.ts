import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ModelList } from '../../../src/application/models/model-list.js';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { RunEstimate } from '../../../src/application/estimate/estimate-types.js';
import type { Area } from '../../../src/domain/code-map/area.js';
import type { PriceTable } from '../../../src/domain/budget/price-table.js';
import { loadPriceTable } from '../../../src/infrastructure/budget/price-file.js';
import { loadModelList } from '../../../src/infrastructure/models/model-list-file.js';
import {
  areaOf,
  createModelEstimateHarness,
  projectWithScan,
} from '../../support/estimate-harness.js';
import { withoutOutputLimits } from '../../support/output-limits.js';
import { settingsFor, withContextTokens } from '../../support/provider-factory-harness.js';
import { userAmy } from '../../support/run-harness.js';

// RF-405, RF-425, Q-57, Q-56: the estimate of a run uses the context window and the output limit
// of each role's model from the shipped list, shows them as its assumptions, and still prices each
// call at the tier its prompt reaches. Shipped files, recorded settings, no model.

const prices = fileURLToPath(new URL('../../../prices/default-prices.yaml', import.meta.url));
const models = fileURLToPath(new URL('../../../prices/models.yaml', import.meta.url));
const haiku = { provider: 'anthropic', model: 'claude-haiku-5-5' };
const haikuWindow = {
  contextTokens: 128_000,
  contextAutomatic: false,
  modelWindowTokens: 1_000_000,
} as const;
const hugeAreas = ['One', 'Two', 'Three', 'Four'].map((name) => areaOf(name, 1_000_000));

let table: PriceTable;
let list: ModelList;

beforeAll(async () => {
  table = await loadPriceTable(prices);
  list = await loadModelList(models);
});

async function estimateOf(
  settings: ProjectSettings,
  areas: readonly Area[] = hugeAreas,
): Promise<RunEstimate> {
  const harness = createModelEstimateHarness(areas, table, list);
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error('The estimate failed');
  return outcome.value;
}

const onHaiku = (): ProjectSettings =>
  withoutOutputLimits(settingsFor({ reader: haiku, verifier: haiku, summariser: haiku }));

function ceilMillion(total: bigint): bigint {
  return (total + 999_999n) / 1_000_000n;
}

describe('the limits the estimate states', () => {
  it('RF-405 shows the context, the model window and the output limit of each role on Haiku 5.5', async () => {
    const estimate = await estimateOf(onHaiku());

    expect(estimate.assumptions.roleLimits).toEqual({
      reader: { ...haikuWindow, maxOutputTokens: 8_192 },
      verifier: { ...haikuWindow, maxOutputTokens: 4_000 },
      summariser: { ...haikuWindow, maxOutputTokens: 4_000 },
    });
    expect(estimate.assumptions.contextLimitTokens).toBe(102_400);
  });

  it('RF-405 the output the reader writes per turn is a share of its 8,192-token limit', async () => {
    const { assumptions } = await estimateOf(onHaiku());

    expect(assumptions.outputTokensPerTurn).toEqual({ low: 1_229, likely: 2_458, high: 4_916 });
  });
});

describe('what a project sets in the estimate', () => {
  it('RF-405 a project that sets the reader output limit gets that number', async () => {
    const base = onHaiku();
    const reader = { ...base.roles.reader, maxOutputTokens: 4_096 };
    const estimate = await estimateOf({ ...base, roles: { ...base.roles, reader } });

    expect(estimate.assumptions.roleLimits.reader.maxOutputTokens).toBe(4_096);
    expect(estimate.assumptions.roleLimits.verifier.maxOutputTokens).toBe(4_000);
  });

  it('RF-405 a project that sets its own context gets that number', async () => {
    const estimate = await estimateOf(withContextTokens(onHaiku(), 'anthropic', 200_000));

    expect(estimate.assumptions.roleLimits.reader.contextTokens).toBe(200_000);
    expect(estimate.assumptions.contextLimitTokens).toBe(160_000);
  });

  it('RF-405 an OpenAI model shows the window of its entry and keeps 128,000 tokens of context', async () => {
    const reader = { provider: 'openai', model: 'gpt-5-mini' };
    const estimate = await estimateOf(withoutOutputLimits(settingsFor({ reader })));

    expect(estimate.assumptions.roleLimits.reader).toMatchObject({
      contextTokens: 128_000,
      modelWindowTokens: 400_000,
    });
    expect(estimate.assumptions.contextLimitTokens).toBe(102_400);
  });
});

describe('models without numbers and local models in the estimate', () => {
  it('RF-405 a model without a window in the list is estimated at 128,000 tokens as before', async () => {
    const reader = { provider: 'anthropic', model: 'claude-haiku-4-5' };
    const estimate = await estimateOf(withoutOutputLimits(settingsFor({ reader })));

    expect(estimate.assumptions.roleLimits.reader).toEqual({
      contextTokens: 128_000,
      contextAutomatic: false,
      maxOutputTokens: 8_192,
    });
    expect(estimate.assumptions.contextLimitTokens).toBe(102_400);
  });

  it('P3-64 an Ollama reader is unchanged: 32,768 tokens, automatic, 4,096 output tokens', async () => {
    const reader = { provider: 'ollama', model: 'gemma4:e4b' };
    const estimate = await estimateOf(withoutOutputLimits(settingsFor({ reader })));

    expect(estimate.assumptions.roleLimits.reader).toEqual({
      contextTokens: 32_768,
      contextAutomatic: true,
      maxOutputTokens: 4_096,
    });
    expect(estimate.assumptions.contextLimitTokens).toBe(26_214);
  });
});

describe('a larger context in the estimate', () => {
  const orders = [areaOf('Orders', 30_000)];

  it('RF-425 grows the reader tokens and the estimate still passes the run cap check', async () => {
    const small = await estimateOf(withContextTokens(onHaiku(), 'anthropic', 20_000), orders);
    const large = await estimateOf(onHaiku(), orders);

    const readerOf = (estimate: RunEstimate) => estimate.roles.find((r) => r.role === 'reader');
    expect(readerOf(large)?.points.likely.inputTokens).toBeGreaterThan(
      readerOf(small)?.points.likely.inputTokens ?? Number.POSITIVE_INFINITY,
    );
    // The start page compares the likely figure with the project's run cost cap (cap-comparison.ts).
    expect(large.total.likely.costMicros).toBeGreaterThan(small.total.likely.costMicros);
    expect(large.total.likely.costMicros).toBeLessThanOrEqual(
      BigInt(onHaiku().budget.run.maxCostMicros),
    );
  });
});

describe('the price tier per call with a larger context', () => {
  // Haiku 5.5, micro-dollars per million tokens: lower tier cache write 125,000 and output
  // 500,000, higher tier (prompt over 100,000 tokens) 625,000 and 2,500,000 (P3-84).
  async function highReader(contextTokens: number): Promise<{ cost: bigint; expected: bigint }> {
    const estimate = await estimateOf(withContextTokens(onHaiku(), 'anthropic', contextTokens));
    const reader = estimate.roles.find((role) => role.role === 'reader');
    if (reader === undefined) throw new Error('The estimate has no reader');
    const { inputTokens, outputTokens, costMicros } = reader.points.high;
    const over = estimate.assumptions.contextLimitTokens > 100_000;
    const write = over ? 625_000n : 125_000n;
    const out = over ? 2_500_000n : 500_000n;
    return {
      cost: costMicros,
      expected: ceilMillion(BigInt(inputTokens) * write + BigInt(outputTokens) * out),
    };
  }

  it('RF-420 a reader whose context share reaches 100,000 tokens is priced at the lower tier', async () => {
    // 125,000 x 0.8 = 100,000: the prompt is not over the threshold.
    const { cost, expected } = await highReader(125_000);

    expect(cost).toBe(expected);
  });

  it('RF-420 a reader whose context share passes 100,000 tokens by one is priced at the higher tier', async () => {
    // floor(125,002 x 0.8) = 100,001.
    const { cost, expected } = await highReader(125_002);

    expect(cost).toBe(expected);
  });

  it('RF-420 the same estimate costs more per token over the threshold', async () => {
    const below = await highReader(125_000);
    const above = await highReader(125_002);

    expect(above.cost).toBeGreaterThan(below.cost);
  });
});
