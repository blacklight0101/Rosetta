import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { cardSaying, planCards } from '../../../support/plan-cards.js';
import {
  createPlanEstimateHarness,
  type PlanEstimateHarness,
} from '../../../support/plan-estimate-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-614, RF-604, RST-1802: the estimate of a plan run is measured from the source run the person
// chose, not from the newest completed one; a run that did not complete is refused, and a run of
// another project or user is not found.

interface TwoRuns {
  readonly h: PlanEstimateHarness;
  readonly older: Run;
  readonly newer: Run;
}

/** An older run with the full plan cards and a newer one with one supported card. */
async function twoRuns(): Promise<TwoRuns> {
  const h = await createPlanEstimateHarness({ seed: false });
  const older = await h.seed({
    ...{ cards: planCards(), run: { runKey: '20261010-090000-understand' } },
  });
  const newer = await h.seed({
    ...{ brief: false, cards: [cardSaying('BR-900', 'Archiving moves an order to cold storage.')] },
    run: { runKey: '20261011-090000-understand' },
  });
  if (older === undefined || newer === undefined) throw new Error('The runs were not seeded');
  return { h, older, newer };
}

function supportedOf(
  result: Awaited<ReturnType<PlanEstimateHarness['estimate']['execute']>>,
): number | undefined {
  return result.ok ? result.value.assumptions.supportedCards : undefined;
}

describe('EstimatePlan: the source run', () => {
  it('RF-614 measures the estimate from the chosen run, not the newest', async () => {
    const { h, older } = await twoRuns();
    const request = { actor: h.actor, projectId: h.project.id };

    const chosen = await h.estimate.execute({ ...request, sourceRunId: older.id });
    const newest = await h.estimate.execute(request);

    expect(supportedOf(newest)).toBe(1);
    expect(supportedOf(chosen)).toBeGreaterThan(1);
  });

  it('RF-614 RF-604 without a chosen run uses the newest completed understand run', async () => {
    const { h, newer } = await twoRuns();

    const named = await h.estimate.execute({
      ...{ actor: h.actor, projectId: h.project.id, sourceRunId: newer.id },
    });
    const unnamed = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });

    expect(supportedOf(unnamed)).toBe(1);
    expect(supportedOf(named)).toBe(supportedOf(unnamed));
  });

  it('RST-1802 refuses a chosen run that ended Failed, even when an older run completed', async () => {
    const { h } = await twoRuns();
    const stopped = await h.seed({
      ...{ brief: false, run: { runKey: '20261012-090000-understand', endState: 'Failed' } },
    });

    const result = await h.estimate.execute({
      ...{ actor: h.actor, projectId: h.project.id, sourceRunId: stopped?.id ?? '' },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });
});

describe('EstimatePlan: a source run that cannot be used', () => {
  it('RST-1802 refuses a chosen run that is not an understand run', async () => {
    const { h } = await twoRuns();
    const scan = await h.seed({
      ...{ brief: false, run: { runKey: '20261012-100000-scan', stage: 'scan' } },
    });

    const result = await h.estimate.execute({
      ...{ actor: h.actor, projectId: h.project.id, sourceRunId: scan?.id ?? '' },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });

  it('RST-1802 refuses a chosen run with no supported claim', async () => {
    const { h } = await twoRuns();
    const empty = await h.seed({
      ...{ brief: false, cards: [], run: { runKey: '20261009-090000-understand', queuedAt: 1 } },
    });

    const result = await h.estimate.execute({
      ...{ actor: h.actor, projectId: h.project.id, sourceRunId: empty?.id ?? '' },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });

  it('RF-1105 an unknown run id is not found', async () => {
    const { h } = await twoRuns();

    const result = await h.estimate.execute({
      ...{ actor: h.actor, projectId: h.project.id, sourceRunId: sampleRun().id },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});

describe('EstimatePlan: a source run that is not found', () => {
  it("RF-1105 another project's run is not found", async () => {
    const { h } = await twoRuns();
    const elsewhere = await h.seed({
      ...{
        brief: false,
        run: {
          runKey: '20261012-090000-understand',
          projectId: '00000000-0000-4000-a000-0000000000ff',
        },
      },
    });

    const result = await h.estimate.execute({
      ...{ actor: h.actor, projectId: h.project.id, sourceRunId: elsewhere?.id ?? '' },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});
