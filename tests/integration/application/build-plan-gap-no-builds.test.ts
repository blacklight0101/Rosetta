import { describe, expect, it } from 'vitest';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { gapRecordingOfAll } from '../../support/gap-plan-harness.js';
import {
  answerOf,
  card,
  gappedPlan as gappedPlanIn,
  messageOf,
  operations,
  plain,
  rest,
  sentinel,
} from '../../support/gap-repair-fixtures.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-627, Q-54: a card of the gap answer that names no builds is repaired once when several items
// are uncovered (the same repair attempt as a card that names a gap); when exactly one item is
// uncovered and the answer holds exactly one such card, the card builds that item without a call.
// Recorded answers written here.

const temp = useTempRoot('rosetta-gap-no-builds-');

const gappedPlan = (gap: Parameters<typeof gappedPlanIn>[1]) => gappedPlanIn(temp.path, gap);

/** The card without its builds list, as a model writes it when it names its item by title. */
const noBuilds = (title: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(card(title, [])).filter(([key]) => key !== 'builds'));

const fixed = card('The journey and its screens', rest);

/** A coverage answer that leaves exactly one item (screen:SCRN-003) for the gap call. */
const oneLeft = JSON.stringify({
  links: [
    { task: 1, builds: ['feature:F-001', ...operations, 'flow:FLOW-001', 'screen:SCRN-001'] },
  ],
});

async function withOneGap(gap: Parameters<typeof gappedPlanIn>[1]) {
  return seededUxPlan(temp.path, {
    harness: { coverageRecording: await withCoverageAnswer(oneLeft), gapRecording: gap },
  });
}

describe('BuildPlan: a card with no builds and several items uncovered', () => {
  it('RF-627 the card is repaired once, and the fixed card is kept', async () => {
    const first = answerOf(card('Operations', operations), noBuilds(sentinel));
    const h = await gappedPlan(gapRecordingOfAll(first, answerOf(fixed)));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    expect(messageOf(h.providers.gapRequests()[1])).toContain('Card 2: the field "builds"');
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('The journey and its screens');
    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
  });

  it('RF-627 a repair card that still names no builds is left out, and the run ends RST-1806', async () => {
    const first = answerOf(card('Operations', operations), noBuilds(sentinel));
    const h = await gappedPlan(gapRecordingOfAll(first, answerOf(noBuilds(`${sentinel}-again`))));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    expect(plain((await h.handoffOf(run))['tasks.md'])).not.toContain(sentinel);
  });
});

describe('BuildPlan: the single-item rule', () => {
  it('RF-627 one uncovered item and one card with no builds: the card builds that item, with no call', async () => {
    const h = await withOneGap(gapRecordingOfAll(answerOf(noBuilds('Implement the one screen'))));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(1);
    expect(plain((await h.handoffOf(run))['checks.md'])).toContain(
      'Every item is built by at least one task card.',
    );
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('Implement the one screen');
    const warned = h.s.logger.entries
      .filter((entry) => entry.level === 'warn')
      .map((entry) => entry.message)
      .join(' ');
    expect(warned).toContain('single-item rule (RF-627)');
    expect(warned).toContain('screen:SCRN-003');
  });
});
