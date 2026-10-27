import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { estimateAccuracy } from '../../../../src/domain/eval/estimate-accuracy.js';
import { entry } from '../../../support/code-map-builders.js';
import { createEstimateHarness, projectWithScan } from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RNF-012, RF-425, P2-46: the likely estimate of an understand run, against the cost of the three
// recorded runs of the demo shop on Claude Haiku 5.5 (a synthetic recording shaped like the live
// evaluation of 2026-10-25, whose likely estimate was 2.8 times the actual cost).

const roleCosts = z.strictObject({ reader: z.int(), verifier: z.int(), summariser: z.int() });
const longPrompt = z.strictObject({
  overInputTokens: z.int(),
  inputPerMillionMicros: z.int(),
  cachedInputPerMillionMicros: z.int(),
  cacheWriteInputPerMillionMicros: z.int(),
  outputPerMillionMicros: z.int(),
});
const recording = z.strictObject({
  note: z.string(),
  areas: z.array(
    z.strictObject({
      name: z.string(),
      estimatedTokens: z.int(),
      files: z.int(),
      pages: z.array(z.string()),
    }),
  ),
  price: z.strictObject({
    provider: z.literal('anthropic'),
    model: z.string(),
    inputPerMillionMicros: z.int(),
    cachedInputPerMillionMicros: z.int(),
    cacheWriteInputPerMillionMicros: z.int(),
    outputPerMillionMicros: z.int(),
    longPrompt,
  }),
  runs: z.array(z.strictObject({ runId: z.string(), costMicros: roleCosts })),
});

const fixture = fileURLToPath(
  new URL('../../../fixtures/eval/p2-46-shop-haiku-run.json', import.meta.url),
);
const shop = recording.parse(JSON.parse(await readFile(fixture, 'utf8')));
const big = (n: number): bigint => BigInt(n);

function priceTable(): PriceTable {
  const { price } = shop;
  const { longPrompt: long, ...flat } = price;
  return {
    version: '2026-10-21',
    currency: 'USD',
    prices: [
      {
        ...flat,
        inputPerMillionMicros: big(flat.inputPerMillionMicros),
        cachedInputPerMillionMicros: big(flat.cachedInputPerMillionMicros),
        cacheWriteInputPerMillionMicros: big(flat.cacheWriteInputPerMillionMicros),
        outputPerMillionMicros: big(flat.outputPerMillionMicros),
        currency: 'USD',
        longPrompt: {
          overInputTokens: long.overInputTokens,
          inputPerMillionMicros: big(long.inputPerMillionMicros),
          cachedInputPerMillionMicros: big(long.cachedInputPerMillionMicros),
          cacheWriteInputPerMillionMicros: big(long.cacheWriteInputPerMillionMicros),
          outputPerMillionMicros: big(long.outputPerMillionMicros),
        },
      },
    ],
  };
}

async function likelyOf(): Promise<{
  readonly total: number;
  readonly byRole: Record<string, number>;
}> {
  const areas: Area[] = shop.areas.map((area) => ({
    name: area.name,
    files: [`${area.name}/File.cs`, ...area.pages],
    estimatedTokens: area.estimatedTokens,
    mapLevel: 'coarse',
    origin: 'folder',
  }));
  const files = shop.areas.flatMap((area) =>
    area.pages.map((path) => entry(path, 10, { artefactKinds: ['page'] })),
  );
  const model = { provider: 'anthropic', model: shop.price.model };
  const settings = settingsFor({ reader: model, verifier: model, summariser: model });
  const harness = createEstimateHarness(areas, files, priceTable());
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error(`The estimate was refused: ${outcome.error}`);
  const byRole = Object.fromEntries(
    outcome.value.roles.map((role) => [role.role, Number(role.points.likely.costMicros)]),
  );
  return { total: Number(outcome.value.total.likely.costMicros), byRole };
}

describe('the estimate against the recorded runs of the demo shop on Haiku 5.5', () => {
  it('RNF-012 the likely estimate is within 30 % of the actual cost of every recorded run', async () => {
    const { total } = await likelyOf();

    for (const run of shop.runs) {
      const actual = run.costMicros.reader + run.costMicros.verifier + run.costMicros.summariser;
      const accuracy = estimateAccuracy({
        likelyMicros: total,
        priced: true,
        actualMicros: actual,
      });

      expect(accuracy.status).toBe('measured');
      expect(accuracy.status === 'measured' && accuracy.withinTarget).toBe(true);
    }
  });

  it('RF-425 no role of the likely estimate is more than twice or under half its recorded cost', async () => {
    const { byRole } = await likelyOf();

    for (const role of ['reader', 'verifier', 'summariser'] as const) {
      const recorded = shop.runs.map((run) => run.costMicros[role]);
      const mean = recorded.reduce((sum, each) => sum + each, 0) / recorded.length;

      expect(byRole[role]).toBeLessThanOrEqual(mean * 2);
      expect(byRole[role]).toBeGreaterThanOrEqual(mean / 2);
    }
  });
});
