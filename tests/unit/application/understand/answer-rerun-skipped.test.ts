import { describe, expect, it } from 'vitest';
import type { AnsweredQuestion } from '../../../../src/application/ports/answers-file.js';
import type { PriorCard } from '../../../../src/application/ports/prior-cards.js';
import { planRerun } from '../../../../src/application/understand/answer-rerun.js';
import { logSkippedQuestions } from '../../../../src/application/understand/skipped-questions.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';

// RF-241: an answered question the re-run leaves out is named with its reason: its run is gone, its
// card is gone, it is already Answered, or its area is no longer in the code map.

const project = { userId: 'u-1', projectId: 'p-1' };
const live = '20261012-100000-understand';
const gone = '20261010-100000-understand';

const answered = (cardId: string, runKey: string): AnsweredQuestion => ({
  ...{ cardId, runKey, question: 'Why?', context: 'a.cs:1-2 x' },
  answer: 'Because.',
});

const card = (id: string, area: string, state: 'Open' | 'Answered'): PriorCard => ({
  ...{ id, type: 'OQ', title: 'A question', area, claims: [] },
  questionState: state,
});

function deps(questions: readonly AnsweredQuestion[]) {
  const earlier: Readonly<Record<string, readonly PriorCard[]>> = {
    [live]: [
      card('OQ-001', 'Catalog', 'Open'),
      card('OQ-002', 'Catalog', 'Answered'),
      card('OQ-003', 'Retired', 'Open'),
    ],
  };
  return {
    answers: { answeredQuestions: () => Promise.resolve(questions) },
    cards: {
      cardsOf: (_project: unknown, runKey: string) => Promise.resolve(earlier[runKey] ?? []),
      markAnswered: () => Promise.resolve([]),
    },
  };
}

describe('the answered questions a re-run leaves out', () => {
  it('RF-241 names each one with its reason and keeps the usable one pending', async () => {
    const plan = await planRerun(
      deps([
        answered('OQ-001', live),
        answered('OQ-002', live),
        answered('OQ-003', live),
        answered('OQ-009', live),
        answered('OQ-001', gone),
      ]),
      project,
      ['Catalog'],
    );

    expect(plan.pending.map((question) => question.cardId)).toEqual(['OQ-001']);
    expect(plan.skipped).toEqual([
      { cardId: 'OQ-002', runKey: live, reason: 'already-answered' },
      { cardId: 'OQ-003', runKey: live, reason: 'area-not-in-code-map' },
      { cardId: 'OQ-009', runKey: live, reason: 'card-gone' },
      { cardId: 'OQ-001', runKey: gone, reason: 'run-gone' },
    ]);
  });

  it('RF-241 skips nothing when every answered question can be used', async () => {
    const plan = await planRerun(deps([answered('OQ-001', live)]), project, ['Catalog']);

    expect(plan.skipped).toEqual([]);
  });
});

describe('the log line of a skipped question', () => {
  it('RF-241 writes one warning per skipped question with the card, the run and the reason', async () => {
    const logger = new MemoryLogger(new FixedClock('2026-10-17T09:00:00.000Z'), new SecretMasker());

    await logSkippedQuestions(logger, { runKey: '20261017-090000-understand', userId: 'u-1' }, [
      { cardId: 'OQ-001', runKey: gone, reason: 'run-gone' },
      { cardId: 'OQ-002', runKey: live, reason: 'already-answered' },
    ]);

    expect(logger.entries.map((entry) => [entry.level, entry.message])).toEqual([
      ['warn', expect.stringMatching(/OQ-001.*20261010-100000-understand.*run.*(deleted|gone)/iu)],
      ['warn', expect.stringMatching(/OQ-002.*20261012-100000-understand.*already Answered/iu)],
    ]);
  });
});
