import { describe, expect, it } from 'vitest';
import { addRunQuestions } from '../../../../src/application/understand/merged-question-events.js';
import { logAnswersCap } from '../../../../src/application/deepen/deepen-answers.js';
import type { DeepenParts } from '../../../../src/application/deepen/deepen-parts.js';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-243, RF-646, EV-57, P8-05: a merge the answers file makes reaches the events, and the Deepen
// log names the cap on the answers given to the readers.

const pair = {
  ...{ keptCardId: 'OQ-001', keptQuestion: 'Who may cancel an order?', keptRunKey: 'old-run' },
  ...{ mergedCardId: 'OQ-001', mergedQuestion: 'Who can cancel orders?', mergedRunKey: 'run-1' },
};

describe('RF-646 EV-57 P8-05 the merges of answers.md are published', () => {
  it('publishes the pairs addQuestions answers', async () => {
    const built = assignCardIds([
      {
        agentTaskId: 't1',
        area: 'orders',
        drafts: [
          draftOf({
            type: 'OQ',
            title: 'Who can cancel orders?',
            question: 'Who can cancel orders?',
            whyItMatters: 'It decides.',
            claims: [{ text: 'c', citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] }],
          }),
        ],
      },
    ]);
    if (!built.ok) throw new Error('the test cards are invalid');
    const emitted: unknown[] = [];
    await addRunQuestions(
      {
        deps: { answers: { addQuestions: () => Promise.resolve([pair]) } },
        execution: {
          run: { runKey: 'run-1', userId: 'u', projectId: 'p' },
          events: { emit: (type, data) => Promise.resolve(emitted.push({ type, data })) },
        },
      },
      built.value,
    );
    expect(emitted).toEqual([{ type: 'question.merged', data: pair }]);
  });
});

function partsOf(logged: { message: string }[], pending: number): DeepenParts {
  const rows = Array.from({ length: pending }, (_, index) => ({
    cardId: 'OQ-001',
    runKey: `2026100${String(index + 1)}-100000-understand`,
    area: 'Other',
    question: `Question ${String(index)}?`,
    answer: 'x'.repeat(3000),
    context: '',
  }));
  return {
    rerun: {
      plan: { project: { userId: 'u', projectId: 'p' }, pending: rows, skipped: [], baseline: [] },
    },
    execution: { run: { runKey: 'run-2', userId: 'u' } },
    logger: { log: (entry: { message: string }) => Promise.resolve(logged.push(entry)) },
  } as unknown as DeepenParts;
}

describe('P8-05 the Deepen log names the cap', () => {
  it('writes the cap line when answers were left out', async () => {
    const logged: { message: string }[] = [];
    await logAnswersCap(partsOf(logged, 9));
    expect(logged).toHaveLength(1);
    expect(logged[0]?.message).toMatch(/capped at 12000 characters.*left out/u);
  });
  it('writes nothing when every answer fits', async () => {
    const logged: { message: string }[] = [];
    await logAnswersCap(partsOf(logged, 2));
    expect(logged).toEqual([]);
  });
});
