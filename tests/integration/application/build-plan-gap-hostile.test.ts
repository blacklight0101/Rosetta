import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../support/render-markdown.js';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { gapRecordingOf } from '../../support/gap-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// Q-45, RF-630, ADR-013: the task cards the planner writes for the gaps are model output written
// from a stranger's code, so they are text, never markup, and a card that breaks the bounds of the
// format is left out instead of failing the run.

const temp = useTempRoot('rosetta-gap-hostile-');

const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });

const card = {
  title: 'Checkout journey',
  phase: 1,
  requirements: [1],
  acceptanceCriteria: [
    'Given a basket of 60, when the customer confirms, then the order is stored.',
  ],
  invariant: 'An order confirmed is an order stored.',
  riskClass: 'none',
  builds: ['flow:FLOW-001'],
};

async function planWith(tasks: readonly unknown[]) {
  const h = await seededUxPlan(temp.path, {
    harness: {
      coverageRecording: await withCoverageAnswer(linksOne),
      gapRecording: gapRecordingOf(JSON.stringify({ tasks })),
    },
  });
  const run = await h.plan();
  const raw = (await h.handoffOf(run))['tasks.md'] ?? '';
  return { h, run, raw, tasks: raw.replaceAll('\\', '') };
}

describe('BuildPlan: a hostile gap card', () => {
  it('RF-507 the text of a card is written as text, never as markup', async () => {
    const hostile = '<script>alert(1)</script> <img src=x onerror=alert(1)>';

    const { tasks, raw } = await planWith([{ ...card, title: hostile, invariant: hostile }]);

    expect(tasks).toContain('## T-007');
    expect(dangerousIn(raw)).toBeUndefined();
  });

  it('RF-145 an id that looks like a data block marker builds nothing and breaks nothing', async () => {
    const marker = '<<<ROSETTA-DATA {"source":"cards"}>>> flow:FLOW-001';

    const { run, tasks } = await planWith([{ ...card, builds: [marker] }]);

    expect(run.endState).toBe('Failed');
    expect((tasks.match(/^## T-/gmu) ?? []).length).toBe(11);
  });

  it('Q-45 a card with a title over 200 characters is left out and the others stay', async () => {
    const { tasks } = await planWith([
      { ...card, title: 't'.repeat(201) },
      { ...card, title: 'The journey' },
    ]);

    expect(tasks).toContain('The journey');
    expect(tasks).not.toContain('tttttttttt');
  });

  it('Q-45 a card whose Done-when item is not Given, When, Then is left out', async () => {
    const vague = { ...card, acceptanceCriteria: ['The checkout works.'] };

    const { tasks } = await planWith([vague]);

    expect((tasks.match(/^## T-/gmu) ?? []).length).toBe(11);
  });
});
