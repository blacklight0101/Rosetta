import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { plain, seedFlowsRun, withFourthAnswer } from '../../support/plan-flows-run.js';
import { fakeOpenAiKey } from '../../support/secret-fixture.js';
import { customerCard, flowCardSaying, planCards } from '../../support/plan-cards.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-625, RF-422, RF-1108, RNF-003: what the plan run does when the flows call goes wrong or is
// stopped: an answer that is not flows, a stop, a secret in a FLOW card and a cap that fits the
// first three planner calls but not the fourth.

const temp = useTempRoot('rosetta-flows-degrade-');
const seeded = (
  ...args: Parameters<typeof seedFlowsRun> extends [string, ...infer R] ? R : never
) => seedFlowsRun(temp.path, ...args);
const files = async (h: Awaited<ReturnType<typeof seeded>>) => h.handoffOf(await h.plan());

describe('BuildPlan: an unusable flows answer', () => {
  it('RF-625 an answer that is not flows still completes, every journey out of scope', async () => {
    const h = await seeded(await withFourthAnswer('No flows today.'));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const written = await h.handoffOf(run);
    expect(Object.keys(written).filter((name) => name.startsWith('flows/FLOW'))).toEqual([]);
    const index = plain(written['flows/README.md'] ?? '');
    expect(index.match(/neither mapped nor left out/gu)).toHaveLength(3);
    const warned = h.s.logger.entries.filter((entry) => entry.level === 'warn');
    expect(warned.map((entry) => entry.message).join(' ')).toContain(
      'target flows could not be read',
    );
  });

  it('RF-625 an answer whose only journey maps no step lists it as out of scope', async () => {
    const answer = JSON.stringify({
      flows: [
        {
          card: 'FLOW-001',
          inScope: true,
          steps: [{ claim: 'FLOW-001.c1', component: 'Nowhere', action: 'x' }],
        },
      ],
    });
    const written = await files(await seeded(await withFourthAnswer(answer)));

    expect(plain(written['flows/README.md'] ?? '')).toMatch(/FLOW-001.*none of its steps/u);
    expect(written['flows/FLOW-001.md']).toBeUndefined();
  });
});

describe('BuildPlan: a stop during the flows call', () => {
  it('RF-1108 a run stopped during the flows call ends Interrupted with no package', async () => {
    let calls = 0;
    const h = await seeded(undefined, {
      beforeCall: async (harness) => {
        calls += 1;
        if (calls === 4) await harness.stopRunning();
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Interrupted');
    expect(await h.handoffOf(run)).toEqual({});
  });
});

describe('BuildPlan: a secret in a FLOW card', () => {
  it('RNF-003 RF-625 never reaches the flows call or the files', async () => {
    const card = flowCardSaying('FLOW-005', `A step uses the token ${fakeOpenAiKey}.`);
    const h = await seeded(undefined, {}, [...planCards(), customerCard(), card]);

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const sent = h.providers
      .requests()[3]
      ?.messages.map((each) => each.content)
      .join(' ');
    expect(sent).toContain('A step uses the token');
    expect(sent).not.toContain(fakeOpenAiKey.slice(8, 30));
    const written = Object.values(await h.handoffOf(run)).join(' ');
    expect(written).not.toContain(fakeOpenAiKey.slice(8, 30));
  });
});

function cappedRun(maxCostMicros: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxCostMicros } },
  });
}

describe('a cap that fits the first three planner calls but not the flows call', () => {
  it('RF-422 RF-625 the guard stops the run before the flows call, with no package', async () => {
    const base = await seedFlowsRun(join(temp.path, 'base'), undefined, { cloudPlanner: true });
    await base.plan({ cloudConsent: true });
    const worst = base.providers.ledger.reservations.map(
      (each) => each.reservation.worstCase.micros,
    );
    const spent = base.providers.ledger.entries.map((each) => each.costMicros);
    const [, , third, fourth] = worst;
    if (third === undefined || fourth === undefined)
      throw new Error('The baseline made four calls');
    expect(spent).toHaveLength(5);
    const before = spent.slice(0, 3).reduce((total, each) => total + each, 0n);
    const cap = before + fourth - 1n;
    expect(cap).toBeGreaterThanOrEqual(spent.slice(0, 2).reduce((t, e) => t + e, 0n) + third);

    const capped = { cloudPlanner: true, settings: cappedRun(Number(cap)) };
    const h = await seedFlowsRun(join(temp.path, 'capped'), undefined, capped);
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    expect(h.providers.requests()).toHaveLength(3);
    expect(await h.handoffOf(run)).toEqual({});
  });
});
