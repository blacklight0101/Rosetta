import { describe, expect, it } from 'vitest';
import type { RunEstimate } from '../../../../src/application/estimate/estimate-types.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import {
  createEstimateHarness,
  projectWithScan,
  type EstimateHarness,
} from '../../../support/estimate-harness.js';
import { sampleKeyRecord } from '../../../support/provider-key-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy, userBob } from '../../../support/run-harness.js';

// RF-425 (first scenario), ADR-007, DEC-13, DEC-54, DEC-107, DEC-117: the estimate before a run, per
// role, as a low, likely and high range with its assumptions, over a fixed code map (Catalog 10,000
// tokens, Orders 4,000) and a fixed price table (one cloud model at 250,000 micros per million
// input tokens and 2,000,000 per million output tokens; a local model is free).

function limited(settings: ProjectSettings, maxTurns: number, maxOutputTokens: number) {
  const reader = { ...settings.roles.reader, maxTurns, maxOutputTokens };
  return { ...settings, roles: { ...settings.roles, reader } };
}

const cloud = limited(
  settingsFor({
    reader: { provider: 'openai', model: 'priced-model' },
    verifier: { provider: 'openai', model: 'priced-model' },
  }),
  10,
  1000,
);
const local = limited(
  settingsFor({
    reader: { provider: 'ollama', model: 'gemma4:e4b' },
    verifier: { provider: 'ollama', model: 'gemma4:e4b' },
  }),
  10,
  1000,
);

async function estimateOf(
  harness: EstimateHarness,
  settings: ProjectSettings,
  areas?: readonly string[],
): Promise<RunEstimate> {
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({
    actor: userAmy,
    projectId: project.id,
    ...(areas === undefined ? {} : { areas }),
  });
  if (!outcome.ok) throw new Error(`The estimate was refused with ${outcome.error}`);
  return outcome.value;
}

describe('RF-425 estimate before running', () => {
  it('RF-425 shows tokens and cost per role as low, likely and high with the assumptions used', async () => {
    const estimate = await estimateOf(createEstimateHarness(), cloud);

    expect(estimate.roles.map((role) => role.role)).toEqual(['reader', 'verifier', 'summariser']);
    for (const role of estimate.roles) {
      expect(Object.keys(role.points)).toEqual(['low', 'likely', 'high']);
    }
    expect(estimate.assumptions.turnsPerArea).toEqual({ low: 3, likely: 6, high: 10 });
    expect(estimate.assumptions.verifierSharePercent).toEqual({ low: 15, likely: 30, high: 50 });
    expect(estimate.assumptions.summariserSharePercent).toEqual({ low: 5, likely: 10, high: 20 });
    expect(estimate.areas).toEqual([
      { name: 'Catalog', estimatedTokens: 10_000, files: 1, thirdParty: false },
      { name: 'Orders', estimatedTokens: 4000, files: 1, thirdParty: false },
    ]);
    expect(estimate.priceTableVersion).toBe('2026-10-11');
    expect(estimate.currency).toBe('USD');
  });

  it('RF-425 prices the reader and the verifier share in bigint micro-dollars (likely)', async () => {
    const estimate = await estimateOf(createEstimateHarness(), cloud);
    const [reader, verifier] = estimate.roles;

    // Reader: 60,996 in at 250,000 and 3,600 out at 2,000,000 per million = 22,449 micros.
    expect(reader?.points.likely).toEqual({
      inputTokens: 60_996,
      outputTokens: 3600,
      costMicros: 22_449n,
    });
    // Verifier: 30% of the reader's tokens (18,299 in, 1,080 out) = 6,734.75, rounded up.
    expect(verifier?.points.likely).toEqual({
      inputTokens: 18_299,
      outputTokens: 1080,
      costMicros: 6735n,
    });
    expect(estimate.total.likely).toEqual({
      // The summariser reads the cards twice (merge, overview) and writes the overview (RF-264).
      inputTokens: 92_295,
      outputTokens: 7040,
      costMicros: 29_184n,
    });
  });
});

describe('RF-425 the range and the roles', () => {
  it('RF-425 the range rises from low to likely to high in tokens and cost', async () => {
    const estimate = await estimateOf(createEstimateHarness(), cloud);

    const { low, likely, high } = estimate.total;

    expect(low.costMicros).toBeLessThan(likely.costMicros);
    expect(likely.costMicros).toBeLessThan(high.costMicros);
    expect(low.inputTokens).toBeLessThan(likely.inputTokens);
    expect(likely.inputTokens).toBeLessThan(high.inputTokens);
  });

  it('RF-425 names the provider, model and the key source each role is priced for', async () => {
    const harness = createEstimateHarness();
    await harness.keys.upsert(sampleKeyRecord(userAmy.userId, 'openai'));

    const estimate = await estimateOf(harness, cloud);

    expect(estimate.roles[0]).toMatchObject({
      role: 'reader',
      provider: 'openai',
      kind: 'openai',
      model: 'priced-model',
      keySource: 'user',
      priced: true,
    });
  });

  it('RF-425 only the named areas are estimated', async () => {
    const all = await estimateOf(createEstimateHarness(), cloud);
    const orders = await estimateOf(createEstimateHarness(), cloud, ['Orders']);

    expect(orders.areas).toEqual([
      { name: 'Orders', estimatedTokens: 4000, files: 1, thirdParty: false },
    ]);
    expect(orders.total.likely.inputTokens).toBe(24_498 + 7350 + 2450 * 2 + 800);
    expect(orders.total.likely.inputTokens).toBeLessThan(all.total.likely.inputTokens);
  });

  it('RF-425 a run with no areas named estimates every area', async () => {
    const estimate = await estimateOf(createEstimateHarness(), cloud, []);

    expect(estimate.areas.map((area) => area.name)).toEqual(['Catalog', 'Orders']);
  });
});

describe('RF-425 local and unpriced models', () => {
  it('RF-420 Ollama-only roles cost zero and still show their tokens', async () => {
    const estimate = await estimateOf(createEstimateHarness(), local);

    for (const role of estimate.roles) {
      expect(role.priced).toBe(true);
      expect(role.keySource).toBe('none');
      for (const point of Object.values(role.points)) {
        expect(point.costMicros).toBe(0n);
        expect(point.inputTokens).toBeGreaterThan(0);
        expect(point.outputTokens).toBeGreaterThan(0);
      }
    }
    expect(estimate.total.high.costMicros).toBe(0n);
    expect(estimate.total.high.inputTokens).toBeGreaterThan(0);
  });
});

describe('RF-427 and DEC-107 prices', () => {
  it('RF-427 a cloud model without a price shows its tokens and an unknown cost', async () => {
    const unpriced = limited(
      settingsFor({
        reader: { provider: 'openai', model: 'mystery-model' },
        verifier: { provider: 'ollama', model: 'gemma4:e4b' },
      }),
      10,
      1000,
    );

    const estimate = await estimateOf(createEstimateHarness(), unpriced);

    const [reader, verifier] = estimate.roles;
    expect(reader).toMatchObject({ priced: false });
    expect(reader?.points.likely.costMicros).toBe(0n);
    expect(reader?.points.likely.inputTokens).toBe(60_996);
    expect(verifier).toMatchObject({ priced: true });
  });

  it('DEC-107 the project price override applies to the own key only; a server key uses the table', async () => {
    const overridden: ProjectSettings = {
      ...cloud,
      budget: {
        ...cloud.budget,
        prices: [
          {
            provider: 'openai',
            model: 'priced-model',
            inputPerMillionMicros: 500_000,
            outputPerMillionMicros: 4_000_000,
            cachedInputPerMillionMicros: 50_000,
          },
        ],
      },
    };
    const withOwnKey = createEstimateHarness();
    await withOwnKey.keys.upsert(sampleKeyRecord(userAmy.userId, 'openai'));

    const own = await estimateOf(withOwnKey, overridden);
    const server = await estimateOf(createEstimateHarness(), overridden);

    expect(own.roles[0]?.points.likely.costMicros).toBe(44_898n);
    expect(server.roles[0]?.points.likely.costMicros).toBe(22_449n);
    expect(server.roles[0]?.keySource).toBe('server');
  });
});

describe('RF-1105 and RST-1307 refusals', () => {
  it('RF-1105 another user project answers not found, like an unknown id', async () => {
    const harness = createEstimateHarness();
    const project = await projectWithScan(harness, userAmy.userId, cloud);

    const other = await harness.estimate.execute({ actor: userBob, projectId: project.id });
    const unknown = await harness.estimate.execute({
      actor: userAmy,
      projectId: '00000000-0000-4000-a000-00000000dead',
    });

    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });

  it('RST-1307 an area the code map does not have is refused, like the understand run', async () => {
    const harness = createEstimateHarness();
    const project = await projectWithScan(harness, userAmy.userId, cloud);

    const outcome = await harness.estimate.execute({
      actor: userAmy,
      projectId: project.id,
      areas: ['Orders', 'Nowhere'],
    });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.areaUnknown });
  });
});

describe('RST-1203 scans', () => {
  it('RST-1203 a project without a completed scan has no code map to estimate from', async () => {
    const harness = createEstimateHarness();
    const project = await projectWithScan(harness, userAmy.userId, cloud, false);
    await harness.runs.insert(
      sampleRun({
        projectId: project.id,
        userId: userAmy.userId,
        stage: 'scan',
        queueState: 'Ended',
        endState: 'Failed',
      }),
    );

    const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.codeMapMissing });
  });

  it('RF-425 estimates from the latest scan that completed, not from a newer failed one', async () => {
    const harness = createEstimateHarness();
    const project = await projectWithScan(harness, userAmy.userId, cloud);
    await harness.runs.insert(
      sampleRun({
        projectId: project.id,
        userId: userAmy.userId,
        stage: 'scan',
        queueState: 'Ended',
        endState: 'Failed',
      }),
    );

    const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });

    expect(outcome.ok).toBe(true);
    expect(harness.scans.opened).toHaveLength(1);
    expect(harness.scans.opened[0]?.endState).toBe('Completed');
  });
});
