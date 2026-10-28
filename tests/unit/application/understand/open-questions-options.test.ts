import { describe, expect, it } from 'vitest';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { openQuestionsOf } from '../../../../src/application/understand/open-questions.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-645, RF-243, DEC-178: the open questions of a run carry the suggested answers of their card, so
// `answers.md` and the answers page can offer them.

const suggested = [
  { answer: 'Yes', description: 'Keep it.', recommended: true, citations: [] },
  { answer: 'No', description: 'Drop it.', recommended: false, citations: [] },
  { answer: 'Sometimes', description: 'Say when.', recommended: false, citations: [] },
] as const;

describe('open questions with suggested answers', () => {
  it('RF-645 an OQ card with suggested answers hands them on, the recommended one first', () => {
    const built = assignCardIds([
      {
        agentTaskId: 'task-1',
        area: 'orders',
        drafts: [
          draftOf({
            type: 'OQ',
            title: 'Cancel?',
            question: 'Who may cancel?',
            whyItMatters: 'It decides the rule.',
            suggestedAnswers: suggested,
          }),
          draftOf({ type: 'OQ', title: 'Old', question: 'Who may refund?', whyItMatters: 'x' }),
        ],
      },
    ]);
    if (!built.ok) throw new Error('the test cards are invalid');

    const [first, second] = openQuestionsOf(built.value, 'run-1');

    expect(first?.options).toEqual([
      { answer: 'Yes', description: 'Keep it.', recommended: true },
      { answer: 'No', description: 'Drop it.', recommended: false },
      { answer: 'Sometimes', description: 'Say when.', recommended: false },
    ]);
    expect(second?.options).toBeUndefined();
  });
});
