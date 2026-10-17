import { describe, expect, it } from 'vitest';
import { publishSkippedQuestions } from '../../../../src/application/understand/skipped-questions.js';
import type { SkippedQuestion } from '../../../../src/application/understand/answer-rerun.js';

// RF-241: each answered question a re-run with answers leaves out is also published as a run event,
// so the run's replay and event log say why the answer was not used.

const runKey = '20261012-100000-understand';

function recorder() {
  const emitted: { type: string; data: Readonly<Record<string, unknown>> }[] = [];
  return {
    emitted,
    events: {
      emit: (type: 'question.skipped', data: Readonly<Record<string, unknown>>) => {
        emitted.push({ type, data });
        return Promise.resolve(undefined);
      },
    },
  };
}

describe('the events of the questions a re-run leaves out', () => {
  it('RF-241 publishes a question.skipped event for each one with its card, run and reason', async () => {
    const skipped: readonly SkippedQuestion[] = [
      { cardId: 'OQ-002', runKey, reason: 'already-answered' },
      { cardId: 'OQ-009', runKey, reason: 'card-gone' },
    ];
    const { events, emitted } = recorder();

    await publishSkippedQuestions(events, skipped);

    expect(emitted).toEqual([
      {
        type: 'question.skipped',
        data: { cardId: 'OQ-002', runKey, reason: 'already-answered' },
      },
      { type: 'question.skipped', data: { cardId: 'OQ-009', runKey, reason: 'card-gone' } },
    ]);
  });

  it('RF-241 publishes nothing when no question is left out', async () => {
    const { events, emitted } = recorder();

    await publishSkippedQuestions(events, []);

    expect(emitted).toEqual([]);
  });
});
