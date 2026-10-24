import { describe, expect, it } from 'vitest';
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
import { useTempRoot } from '../../support/temp-root.js';

// Q-54, RF-627, RF-630, ADR-013: a card of the gap answer that the plan does not take (a risk class
// that does not exist, Done-when items in prose, a phase outside the plan, builds that name no open
// gap) is logged with its position and field, never with answer text; when it named an item that is
// still uncovered the planner gets the one repair attempt. Recorded answers written here.

const temp = useTempRoot('rosetta-gap-left-out-');

const gappedPlan = (gap: Parameters<typeof gappedPlanIn>[1]) => gappedPlanIn(temp.path, gap);

const fixedJourney = answerOf(card('The journey, fixed', rest));

describe('BuildPlan: a card the plan does not take is logged and repaired', () => {
  it.each([
    ['a risk class that does not exist', { riskClass: 'catastrophe' }, 'riskClass'],
    [
      'Done-when items in prose',
      { acceptanceCriteria: ['The order is stored.'] },
      'acceptanceCriteria',
    ],
    ['no invariant', { invariant: '' }, 'invariant'],
    ['a phase outside the plan', { phase: 9 }, 'phase'],
  ])(
    'Q-54 a card with %s is logged by position and field, and repaired',
    async (_n, bad, field) => {
      const first = answerOf(card('Operations', operations), card(sentinel, rest, bad));
      const h = await gappedPlan(gapRecordingOfAll(first, fixedJourney));

      const run = await h.plan();

      expect(run.endState).toBe('Completed');
      expect(h.providers.gapRequests()).toHaveLength(2);
      const left = h.s.logger.entries
        .map((entry) => entry.message)
        .filter((m) => m.includes('of the gap'));
      expect(left).toHaveLength(1);
      expect(left[0]).toMatch(new RegExp(`position 2 of the gap answer.*field "${field}"`, 'u'));
      expect(messageOf(h.providers.gapRequests()[1])).toContain(`Card 2: the field "${field}"`);
      expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
      expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('The journey, fixed');
    },
  );

  it('Q-54 a card whose builds name no open gap is logged and asks for no repair', async () => {
    const nothing = card('Nothing', ['feature:F-001', 'operation:ghost']);
    const answer = answerOf(card('Everything', [...operations, ...rest]), nothing);
    const h = await gappedPlan(gapRecordingOfAll(answer));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(1);
    const left = h.s.logger.entries
      .map((entry) => entry.message)
      .filter((m) => m.includes('of the gap'));
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(/position 2 of the gap answer.*field "builds"/u);
  });
});

describe('BuildPlan: the positions of the answer', () => {
  it('Q-54 the position is that of the answer when an unreadable card comes before', async () => {
    const first = answerOf(
      'not a card',
      card('Operations', operations),
      card(sentinel, rest, { phase: 9 }),
    );
    const h = await gappedPlan(gapRecordingOfAll(first, fixedJourney));

    await h.plan();

    const left = h.s.logger.entries
      .map((entry) => entry.message)
      .filter((m) => m.includes('of the gap'));
    expect(left[0]).toMatch(/position 1 of the gap answer.*field "card"/u);
    expect(left[1]).toMatch(/position 3 of the gap answer.*field "phase"/u);
  });

  it('Q-54 the dependsOn of a card are positions of the answer, whatever came before', async () => {
    const first = answerOf(
      'not a card',
      card('Operations', operations),
      card('Journey', rest, { dependsOn: [2] }),
    );
    const h = await gappedPlan(gapRecordingOfAll(first));

    const written = await h.handoffOf(await h.plan());

    const journey = plain(written['tasks.md'])
      .split(/^## /mu)
      .find((c) => c.includes('**Journey**'));
    expect(journey).toMatch(/Depends on:.*\[T-007\]/u);
  });
});
