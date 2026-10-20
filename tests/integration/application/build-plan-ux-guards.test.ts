import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { screenCardWithField } from '../../support/plan-screen-cards.js';
import { fakeOpenAiKey } from '../../support/secret-fixture.js';
import { useTempRoot } from '../../support/temp-root.js';
import {
  allCallCards,
  plain,
  seededUxPlan,
  uxFilesOf,
  withUxAnswer,
} from '../../support/ux-plan-harness.js';

// RF-626, RF-613, RF-422, RF-1108, RNF-003: what the plan run does when the screens call goes
// wrong or is stopped: an answer that is not screens, a stop, a secret in a SCRN card, a cap that
// fits the first five planner calls but not the sixth, and the estimate that counts the call.

const temp = useTempRoot('rosetta-ux-guards-');

describe('BuildPlan: an unusable screens answer', () => {
  it('RF-626 an answer that is not screens still completes, every screen dropped, the brief marked empty', async () => {
    const h = await seededUxPlan(temp.path, { recording: await withUxAnswer('No screens today.') });

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const written = await h.handoffOf(run);
    expect(uxFilesOf(written)).toEqual(['ux/README.md', 'ux/design-brief.md']);
    const index = plain(written['ux/README.md']);
    expect(index.match(/neither kept, merged nor dropped/gu)).toHaveLength(5);
    expect(plain(written['ux/design-brief.md'])).toContain('Not stated: the cards do not say this');
    const warned = h.s.logger.entries
      .filter((entry) => entry.level === 'warn')
      .map((entry) => entry.message)
      .join(' ');
    expect(warned).toContain('screens could not be read');
  });

  it('RF-626 an answer that keeps no usable card lists every screen as dropped, with no wireframe', async () => {
    const answer = JSON.stringify({ screens: [{ name: 'Ghost', cards: ['SCRN-404'] }] });
    const h = await seededUxPlan(temp.path, { recording: await withUxAnswer(answer) });

    const written = await h.handoffOf(await h.plan());

    expect(uxFilesOf(written).filter((name) => name.endsWith('.html'))).toEqual([]);
    expect(plain(written['ux/README.md']).match(/\| dropped \| none \|/gu)).toHaveLength(5);
  });
});

describe('BuildPlan: a stop during the screens call', () => {
  it('RF-1108 a run stopped during the sixth call ends Interrupted with no package', async () => {
    let calls = 0;
    const h = await seededUxPlan(temp.path, {
      harness: {
        beforeCall: async (harness) => {
          calls += 1;
          if (calls === 6) await harness.stopRunning();
        },
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Interrupted');
    expect(await h.handoffOf(run)).toEqual({});
  });
});

describe('BuildPlan: a secret in a SCRN card', () => {
  it('RNF-003 RF-626 never reaches the screens call or the files', async () => {
    const card = screenCardWithField('SCRN-006', `Token ${fakeOpenAiKey}`);
    const h = await seededUxPlan(temp.path, { cards: [...allCallCards(), card] });

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    const sent = h.providers
      .requests()[5]
      ?.messages.map((each) => each.content)
      .join(' ');
    expect(sent).toContain('SCRN-006');
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

function priced(folder: string, change?: (settings: ProjectSettings) => ProjectSettings) {
  const harness = { cloudPlanner: true, ...(change === undefined ? {} : { settings: change }) };
  return seededUxPlan(join(temp.path, folder), { harness });
}

describe('plan estimate with the screens call', () => {
  it('RF-613 RF-626 RF-627 shows seven planner calls (the coverage call last), high covering the sum of their worst cases', async () => {
    const h = await priced('six');

    const estimate = await h.estimate();
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('Completed');
    const reservations = h.providers.ledger.reservations.map((each) => each.reservation);
    const { high } = estimate.planner.points;
    expect(reservations).toHaveLength(7);
    const sum = (pick: (worst: (typeof reservations)[number]['worstCase']) => bigint): bigint =>
      reservations.reduce((total, each) => total + pick(each.worstCase), 0n);
    // The flows call's components block is sized at the plan answer's limits (flows-estimate.ts), so the
    // high figure is an upper bound of the guard's worst cases, never below them.
    expect(high.costMicros).toBeGreaterThanOrEqual(sum((worst) => worst.micros));
    expect(BigInt(high.inputTokens + high.outputTokens)).toBeGreaterThanOrEqual(
      sum((worst) => worst.tokens),
    );
    expect(estimate.assumptions.calls).toBe(9);
  });
});

describe('a cap that fits the first five planner calls but not the sixth', () => {
  it('RF-422 RF-626 the guard stops the run before the screens call, with no package', async () => {
    const base = await priced('base');
    await base.plan({ cloudConsent: true });
    const worst = base.providers.ledger.reservations.map(
      (each) => each.reservation.worstCase.micros,
    );
    const spent = base.providers.ledger.entries.map((each) => each.costMicros);
    expect(worst).toHaveLength(7);
    const [fifth = 0n, sixth = 0n] = [worst[4], worst[5]];
    const before = spent.slice(0, 5).reduce((total, each) => total + each, 0n);
    const cap = before + sixth - 1n;
    expect(cap).toBeGreaterThanOrEqual(before - (spent[4] ?? 0n) + fifth);

    const h = await priced('capped', cappedRun(Number(cap)));
    const run = await h.plan({ cloudConsent: true });

    expect(run.endState).toBe('CapReached');
    expect(h.providers.requests()).toHaveLength(5);
    expect(await h.handoffOf(run)).toEqual({});
  });
});
