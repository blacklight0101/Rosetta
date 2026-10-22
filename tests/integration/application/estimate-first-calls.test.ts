import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ModelList } from '../../../src/application/models/model-list.js';
import type { RunEstimate } from '../../../src/application/estimate/estimate-types.js';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { worstCaseCost } from '../../../src/domain/budget/price.js';
import { lookupPrice, type PriceTable } from '../../../src/domain/budget/price-table.js';
import { loadPriceTable } from '../../../src/infrastructure/budget/price-file.js';
import { loadModelList } from '../../../src/infrastructure/models/model-list-file.js';
import {
  areaOf,
  createCappedEstimateHarness,
  projectWithScan,
} from '../../support/estimate-harness.js';
import { withoutOutputLimits } from '../../support/output-limits.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { userAmy } from '../../support/run-harness.js';

// RF-405, RF-422, RF-1106, Q-57, DEC-159 (P3-96): the estimate states the reservation of the first
// reader calls the budget guard will hold and which caps cannot hold it. Shipped files, recorded
// prices, no provider call.

const prices = fileURLToPath(new URL('../../../prices/default-prices.yaml', import.meta.url));
const models = fileURLToPath(new URL('../../../prices/models.yaml', import.meta.url));
const areas = ['One', 'Two', 'Three', 'Four'].map((name) => areaOf(name, 200_000));
const sonnet = { provider: 'anthropic', model: 'claude-sonnet-5-5' };
const opus = { provider: 'anthropic', model: 'claude-opus-5-5' };
const roomy = { runMicros: 3_000_000n, userDayMicros: 5_000_000n, serverMonthMicros: 50_000_000n };

let table: PriceTable;
let list: ModelList;

beforeAll(async () => {
  table = await loadPriceTable(prices);
  list = await loadModelList(models);
});

interface Options {
  readonly runCapMicros?: number;
  readonly caps?: { runMicros: bigint; userDayMicros: bigint; serverMonthMicros: bigint };
}

async function estimateOn(
  target: typeof opus,
  options: Options & { readonly areaCount?: number } = {},
): Promise<RunEstimate> {
  const base = withoutOutputLimits(
    settingsFor({ reader: target, verifier: target, summariser: target }),
  );
  const settings: ProjectSettings =
    options.runCapMicros === undefined
      ? base
      : {
          ...base,
          budget: {
            ...base.budget,
            run: { ...base.budget.run, maxCostMicros: options.runCapMicros },
          },
        };
  const harness = await createCappedEstimateHarness(
    { areas: areas.slice(0, options.areaCount ?? areas.length), priceTable: table, models: list },
    { userId: userAmy.userId, ...(options.caps === undefined ? {} : { caps: options.caps }) },
  );
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error('The estimate failed');
  return outcome.value;
}

function unfit(estimate: RunEstimate) {
  return (estimate.firstCalls?.caps ?? []).filter((cap) => !cap.fits);
}

describe('the reservation of the first calls', () => {
  it('RF-405 default caps on Claude Sonnet 5.5 hold the first reader calls: no cap is short', async () => {
    const estimate = await estimateOn(sonnet);

    expect(estimate.firstCalls?.calls).toBe(4);
    expect(unfit(estimate)).toEqual([]);
  });

  it('RF-405 fewer areas than the reader parallelism reserve only as many calls as there are areas', async () => {
    const two = await estimateOn(opus, { areaCount: 2 });
    const four = await estimateOn(opus);

    expect(two.firstCalls?.calls).toBe(2);
    expect(two.firstCalls?.reservedMicros).toBe((four.firstCalls?.reservedMicros ?? 0n) / 2n);
  });

  it('RF-405 the reservation is the guard worst case of one call times the parallel calls', async () => {
    const estimate = await estimateOn(opus);
    const lookup = lookupPrice(table, [], {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      keySource: 'server',
    });
    if (lookup.kind !== 'priced') throw new Error('Opus has a price');
    const { promptTokens } = estimate.firstCalls ?? { promptTokens: 0 };
    const one = worstCaseCost(lookup.price, { promptTokens, maxOutputTokens: 8_192 }).micros;

    expect(estimate.firstCalls?.reservedMicros).toBe(one * 4n);
  });
});

describe('the caps that cannot hold the first calls', () => {
  it('RF-405 default caps on Claude Opus 5.5 cannot hold them: the run cap is named with the amount', async () => {
    const estimate = await estimateOn(opus);
    const [run, ...rest] = unfit(estimate);

    expect(rest).toEqual([]);
    expect(run?.kind).toBe('run-cost');
    expect(run?.limit).toBe(500_000n);
    expect(estimate.firstCalls?.reservedMicros).toBeGreaterThan(500_000n);
  });

  it('RF-405 a run cap of 3.00 USD on Opus holds them', async () => {
    const estimate = await estimateOn(opus, { runCapMicros: 3_000_000, caps: roomy });

    expect(unfit(estimate)).toEqual([]);
  });

  it('RF-1106 a lower administrator cap is the run cap that is named', async () => {
    const estimate = await estimateOn(opus, {
      runCapMicros: 3_000_000,
      caps: { runMicros: 300_000n, userDayMicros: 5_000_000n, serverMonthMicros: 50_000_000n },
    });
    const [run] = unfit(estimate);

    expect(run?.kind).toBe('run-cost');
    expect(run?.limit).toBe(300_000n);
    expect(estimate.firstCalls?.adminRunCapMicros).toBe(300_000n);
  });

  it('RF-1106 the daily cap is named when the run cap holds but the day does not', async () => {
    const estimate = await estimateOn(opus, {
      runCapMicros: 3_000_000,
      caps: { runMicros: 3_000_000n, userDayMicros: 400_000n, serverMonthMicros: 50_000_000n },
    });

    expect(unfit(estimate).map((cap) => cap.kind)).toEqual(['user-day']);
  });
});
