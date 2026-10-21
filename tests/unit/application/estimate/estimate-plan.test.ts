import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { PlanEstimate } from '../../../../src/application/estimate/plan-estimate-types.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Result } from '../../../../src/domain/errors/result.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import {
  createPlanEstimateHarness,
  plannerSettings,
  type PlanEstimateHarness,
  type PlanEstimateOptions,
} from '../../../support/plan-estimate-harness.js';
import { sampleKeyRecord } from '../../../support/provider-key-fixtures.js';

// RF-613, ADR-007, DEC-81, DEC-107: the estimate before a plan run. The planner makes one call; the
// estimate gives it as a low, likely and high figure and checks each figure against the caps the
// budget guard will check the call against. The high figure writes the planner's whole
// `maxOutputTokens` (16,384 here, set by the test; the high figure also reserves two continuations of each call, RF-604), as the guard's worst case does. Fixed price table: one
// cloud model at 250,000 micros per million input tokens and 2,000,000 per million output tokens;
// a local model is free.

const cloudPlanner = { provider: 'openai', model: 'priced-model' } as const;

/** The planner on this model with the 16,384-token output limit the figures below are worked from (Q-57: a hosted default would be 32,000). */
function limitedPlanner(
  planner: { readonly provider: string; readonly model: string },
  change: (settings: ProjectSettings) => ProjectSettings = (settings) => settings,
) {
  return plannerSettings(planner, (settings) => {
    const { planner: role } = settings.roles;
    const roles = { ...settings.roles, planner: { ...role, maxOutputTokens: 16_384 } };
    return change({ ...settings, roles });
  });
}

async function estimateOf(
  options: PlanEstimateOptions = {},
): Promise<{ readonly h: PlanEstimateHarness; readonly estimate: PlanEstimate }> {
  const h = await createPlanEstimateHarness({
    settings: limitedPlanner(cloudPlanner),
    ...options,
  });
  return { h, estimate: valueOf(await run(h)) };
}

function run(h: PlanEstimateHarness) {
  return h.estimate.execute({ actor: h.actor, projectId: h.project.id });
}

/** The estimate of an ok result; the test fails on the result's code otherwise. */
function valueOf<E>(result: Result<PlanEstimate, E>): PlanEstimate {
  expect(result.ok ? 'ok' : result.error).toBe('ok');
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

function cap(estimate: PlanEstimate, kind: string) {
  return estimate.caps.find((each) => each.kind === kind);
}

describe('EstimatePlan: the planner range', () => {
  it('RF-613 gives the planner call as a low, likely and high range; high writes the whole output limit', async () => {
    const { estimate } = await estimateOf();

    const { planner, assumptions } = estimate;
    expect(planner).toMatchObject({
      ...{ role: 'planner', provider: 'openai', kind: 'openai', model: 'priced-model' },
      ...{ keySource: 'server', priced: true },
    });
    expect(planner.points.low.outputTokens).toBe(24576);
    expect(planner.points.likely.outputTokens).toBe(49152);
    expect(planner.points.high.outputTokens).toBe(294912);
    expect(planner.points.low.inputTokens).toBeGreaterThan(0);
    expect(planner.points.high.inputTokens).toBeGreaterThan(planner.points.low.inputTokens);
    expect(planner.points.low.costMicros).toBeLessThan(planner.points.likely.costMicros);
    expect(planner.points.likely.costMicros).toBeLessThan(planner.points.high.costMicros);
    expect(planner.points.high.costMicros).toBeGreaterThanOrEqual(16_384n);
    expect(assumptions).toMatchObject({ calls: 6, maxOutputTokens: 16384 });
    expect(assumptions.promptTokens).toBe(planner.points.low.inputTokens);
    expect(estimate).toMatchObject({ currency: 'USD', priceTableVersion: '2026-10-11' });
  });

  it('RF-613 counts the prompt of the call: the supported cards, and the answers the owner gave', async () => {
    const without = await estimateOf();
    const answered = await estimateOf({
      seed: { answer: 'Only a manager may cancel a paid order, and only before it ships.' },
    });

    expect(without.estimate.assumptions).toMatchObject({ supportedCards: 4, answeredQuestions: 0 });
    expect(answered.estimate.assumptions).toMatchObject({
      supportedCards: 4,
      answeredQuestions: 1,
    });
    expect(answered.estimate.assumptions.promptTokens).toBeGreaterThan(
      without.estimate.assumptions.promptTokens,
    );
  });
});

describe('EstimatePlan: the PRD call', () => {
  it('RF-613 RF-621 counts the PRD call too: its own prompt is measured and added to the plan call', async () => {
    const { estimate } = await estimateOf();

    const { assumptions, planner } = estimate;
    const packageSize = (await readFile('prompts/planner/package.v4.md', 'utf8')).length;
    const prdSize = (await readFile('prompts/planner/prd.v1.md', 'utf8')).length;
    const planTokens =
      assumptions.promptTokens -
      assumptions.prdPromptTokens -
      assumptions.dataModelPromptTokens -
      assumptions.flowsPromptTokens -
      assumptions.coveragePromptTokens -
      assumptions.gapPromptTokens -
      assumptions.gapRepairPromptTokens;
    expect(assumptions.prdPromptTokens).toBeGreaterThan(0);
    expect(planTokens).toBeGreaterThan(0);
    expect(
      Math.abs(planTokens - assumptions.prdPromptTokens - (packageSize - prdSize) / 4),
    ).toBeLessThan(2);
    expect(planner.points.low.inputTokens).toBe(assumptions.promptTokens);
    expect(planner.points.high.outputTokens).toBe(6 * 3 * assumptions.maxOutputTokens);
  });
});

describe('EstimatePlan: the planner price', () => {
  it('RF-613 a local planner costs nothing and still shows its tokens', async () => {
    const { estimate } = await estimateOf({
      settings: plannerSettings({ provider: 'ollama', model: 'gemma4:e4b' }),
    });

    expect(estimate.planner).toMatchObject({ kind: 'ollama', keySource: 'none', priced: true });
    expect(estimate.planner.points.high.costMicros).toBe(0n);
    expect(estimate.planner.points.high.outputTokens).toBe(294912);
    expect(estimate.withinCaps).toEqual({ low: true, likely: true, high: true });
  });

  it('RF-427 a cloud planner without a price shows tokens, no cost, and only the token caps bind', async () => {
    const { estimate } = await estimateOf({
      settings: limitedPlanner({ provider: 'openai', model: 'unlisted-model' }),
    });

    expect(estimate.planner.priced).toBe(false);
    expect(estimate.planner.points.high.costMicros).toBe(0n);
    expect(estimate.planner.points.high.outputTokens).toBe(294912);
  });
});

describe('EstimatePlan: against the project caps', () => {
  it('RF-613 lists the run caps of the project and the administrator for a server key', async () => {
    const { estimate } = await estimateOf();

    expect(estimate.caps.map((each) => each.kind)).toEqual([
      ...['run-cost', 'run-tokens', 'user-day', 'server-month'],
    ]);
    expect(cap(estimate, 'run-cost')).toMatchObject({
      ...{ unit: 'micros', limit: 500_000n, spent: 0n, remaining: 500_000n },
      fits: { low: true, likely: true, high: false },
    });
    expect(cap(estimate, 'run-tokens')).toMatchObject({ unit: 'tokens', limit: 2_000_000n });
    expect(estimate.withinCaps).toEqual({ low: true, likely: true, high: false });
  });

  it('RF-613 a run cap between the likely and the high figure leaves high not fitting', async () => {
    const first = await estimateOf();
    const limit = first.estimate.planner.points.likely.costMicros;

    const { estimate } = await estimateOf({
      settings: limitedPlanner(cloudPlanner, (settings) => ({
        ...settings,
        budget: {
          ...settings.budget,
          run: { ...settings.budget.run, maxCostMicros: Number(limit) },
        },
      })),
    });

    expect(cap(estimate, 'run-cost')?.fits).toEqual({ low: true, likely: true, high: false });
    expect(estimate.withinCaps).toEqual({ low: true, likely: true, high: false });
  });
});

describe('EstimatePlan: against the role caps', () => {
  it('RF-423 the cap of the planner role is checked besides the run caps', async () => {
    const first = await estimateOf();
    const { points } = first.estimate.planner;
    const tokens = points.likely.inputTokens + points.likely.outputTokens;

    const { estimate } = await estimateOf({
      settings: limitedPlanner(cloudPlanner, (settings) => ({
        ...settings,
        budget: { ...settings.budget, roles: { planner: { maxTokens: tokens } } },
      })),
    });

    expect(cap(estimate, 'role-tokens')).toMatchObject({
      ...{ unit: 'tokens', limit: BigInt(tokens), spent: 0n },
      fits: { low: true, likely: true, high: false },
    });
    expect(estimate.withinCaps.high).toBe(false);
  });
});

describe('EstimatePlan: against the account caps', () => {
  it('RF-1106 a server key is checked against what is left of the user day, in UTC', async () => {
    const { low, likely } = (await estimateOf()).estimate.planner.points;
    const room = (low.costMicros + likely.costMicros) / 2n;
    const account = { dailyCapMicros: 6_000n + room };
    const h = await createPlanEstimateHarness({ settings: limitedPlanner(cloudPlanner), account });
    const row = { userId: h.actor.userId, currency: 'USD', keySource: 'server' } as const;
    h.usage.addCost({ ...row, at: h.clock.now(), costMicros: 6_000n });
    h.usage.addCost({ ...row, at: new Date('2026-10-11T23:59:59.000Z'), costMicros: 9_000n });

    const estimate = valueOf(await run(h));

    expect(cap(estimate, 'user-day')).toMatchObject({
      ...{ unit: 'micros', limit: 6_000n + room, spent: 6_000n, remaining: room },
      fits: { low: true, likely: false, high: false },
    });
    expect(estimate.withinCaps).toEqual({ low: true, likely: false, high: false });
  });

  it('RF-1106 a server key is checked against what is left of the server month', async () => {
    const h = await createPlanEstimateHarness({ settings: limitedPlanner(cloudPlanner) });
    await h.serverSettings.saveCaps({
      ...{ runMicros: 500_000n, userDayMicros: 2_000_000n, serverMonthMicros: 20_000n },
    });
    const other = { userId: 'someone-else', currency: 'USD', keySource: 'server' } as const;
    h.usage.addCost({ ...other, at: new Date('2026-10-02T08:00:00.000Z'), costMicros: 15_000n });

    const estimate = valueOf(await run(h));

    expect(cap(estimate, 'server-month')).toMatchObject({ limit: 20_000n, remaining: 5_000n });
    expect(cap(estimate, 'server-month')?.fits.high).toBe(false);
    expect(cap(estimate, 'user-day')?.fits.high).toBe(true);
  });

  it('DEC-107 an own key is checked against the own daily cap and not the server caps', async () => {
    const h = await createPlanEstimateHarness({
      settings: limitedPlanner(cloudPlanner),
      account: { ownDailyCapMicros: 5_000n },
    });
    await h.keys.upsert(sampleKeyRecord(h.actor.userId, 'openai'));

    const estimate = valueOf(await run(h));

    expect(estimate.planner.keySource).toBe('user');
    expect(estimate.caps.map((each) => each.kind)).toEqual(['run-cost', 'run-tokens', 'own-day']);
    expect(cap(estimate, 'own-day')).toMatchObject({ limit: 5_000n, remaining: 5_000n });
    expect(cap(estimate, 'own-day')?.fits.high).toBe(false);
  });
});

describe('EstimatePlan: what stops it before any figure', () => {
  it('RST-1801 a project without a saved planning brief has no estimate', async () => {
    const h = await createPlanEstimateHarness({ seed: { brief: false } });

    expect(await run(h)).toEqual({ ok: false, error: ERROR_CODES.planBriefMissing });
  });

  it('RST-1802 a project without a finished understand run has no estimate', async () => {
    const h = await createPlanEstimateHarness({ seed: { understand: false } });

    expect(await run(h)).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });

  it('RST-1802 an understand run with no supported claim has no estimate', async () => {
    const h = await createPlanEstimateHarness({ seed: { cards: [] } });

    expect(await run(h)).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });

  it("RF-1105 another user's project and an unknown id are not found", async () => {
    const h = await createPlanEstimateHarness();
    const stranger = { userId: '00000000-0000-4000-9000-0000000000ff', role: 'user' } as const;

    const theirs = await h.estimate.execute({ actor: stranger, projectId: h.project.id });
    const unknown = await h.estimate.execute({ actor: h.actor, projectId: sampleProject().id });

    expect(theirs).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});
