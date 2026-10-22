import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { gapRecordingOfAll } from '../../support/gap-plan-harness.js';
import {
  answerOf,
  card,
  messageOf,
  operations,
  plain,
  rest,
  sentinel,
} from '../../support/gap-repair-fixtures.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';

// RF-627, Q-54: a card of the gap answer whose builds name no item of the uncovered block (a title
// instead of an id, say) gives no valid builds, as a missing or empty list does: the repair attempt
// asks for it once, and with exactly one item uncovered the single-item rule builds that item.

const temp = useTempRoot('rosetta-gap-title-builds-');

const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });
const linksAllButOne = JSON.stringify({
  links: [
    { task: 1, builds: ['feature:F-001', ...operations, 'flow:FLOW-001', 'screen:SCRN-001'] },
  ],
});

async function gappedPlan(coverage: string, gap: Recording) {
  return seededUxPlan(temp.path, {
    harness: { coverageRecording: await withCoverageAnswer(coverage), gapRecording: gap },
  });
}

const fixed = card('The journey and its screens', rest);

describe('BuildPlan: a card whose builds name a title, not an item of the block', () => {
  it('RF-627 several items uncovered: the card gets one repair, and the fixed card is kept', async () => {
    const first = answerOf(card('Operations', operations), card(sentinel, ['System Dashboard']));
    const h = await gappedPlan(linksOne, gapRecordingOfAll(first, answerOf(fixed)));

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(2);
    expect(messageOf(h.providers.gapRequests()[1])).toContain('Card 2: the field "builds"');
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('The journey and its screens');
    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
  });

  it('RF-627 one item uncovered: the card builds that item, with no call', async () => {
    const h = await gappedPlan(
      linksAllButOne,
      gapRecordingOfAll(answerOf(card('Implement the one screen', ['System Dashboard']))),
    );

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(1);
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('Implement the one screen');
  });

  it('RF-627 every item covered by the gap answer: a card that names nothing asks for no repair', async () => {
    const h = await gappedPlan(
      linksOne,
      gapRecordingOfAll(
        answerOf(
          card('Everything', [...operations, ...rest]),
          card('Nothing', ['System Dashboard']),
        ),
      ),
    );

    const run = await h.plan();

    expect(run.endState).toBe('Completed');
    expect(h.providers.gapRequests()).toHaveLength(1);
  });
});

describe('BuildPlan: a cap reached before the repair', () => {
  it('RF-422 RF-1600 stops the run CapReached with its code, and the first package is kept', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(linksOne),
        gapRecording: gapRecordingOfAll(
          answerOf(card('Operations', operations), card(sentinel, ['System Dashboard'])),
        ),
        beforeGapCall: (harness) =>
          harness.providers.gapRequests().length === 0
            ? Promise.resolve()
            : Promise.reject(
                new RosettaError(ERROR_CODES.budgetCapReached, 'The call would pass the cap.'),
              ),
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('CapReached');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1600' }));
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('Operations');
  });
});
