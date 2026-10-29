import { describe, expect, it } from 'vitest';
import type { Card } from '../../../../src/domain/cards/card.js';
import { maskCard, maskCardText } from '../../../../src/infrastructure/cards/mask-card-text.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';

// RF-141, RF-645, ADR-013: the suggested answers of an OQ card are card text like any other, so a
// secret the model copied into an answer or its description is masked before anything is written.
// Mutation: dropping the mask of the answer or of the description makes this test fail.

const answerSecret = 'Server=db;User Id=sa;Password=FAKE-A1-aaaa-bbbb';
const descriptionSecret = 'api_key=FAKE-D1-cccc-dddd-eeee';

const saved: Card = {
  id: 'OQ-001',
  type: 'OQ',
  title: 'Which database does the shop use?',
  summary: 'The connection string is read at start.',
  area: 'orders',
  agentTaskId: 'task-orders',
  confidence: 'Low',
  claims: [],
  question: 'Which database does the shop use?',
  whyItMatters: 'The new system must connect to the same data.',
};

const question: Card = {
  ...saved,
  suggestedAnswers: [
    {
      answer: `The one in "${answerSecret}"`,
      description: 'The production database.',
      recommended: true,
      citations: [{ path: 'src/Data/Db.cs', startLine: 3, endLine: 9 }],
    },
    {
      answer: 'A test database',
      description: `Read from "${descriptionSecret}" in the settings.`,
      recommended: false,
      citations: [],
    },
    { answer: 'Both', description: 'Yes, but only in staging.', recommended: false, citations: [] },
  ],
};

describe('RF-645 suggested answers are masked like the rest of the card', () => {
  it('RF-645 a secret in an answer and in a description is masked, the rest kept', () => {
    const masked = maskCard(question, new SecretMasker());

    expect(masked.suggestedAnswers).toHaveLength(3);
    const [first, second, third] = masked.suggestedAnswers ?? [];
    expect(JSON.stringify(first)).not.toContain('FAKE-A1');
    expect(JSON.stringify(first)).toContain('The one in');
    expect(JSON.stringify(second)).not.toContain('FAKE-D1');
    expect(JSON.stringify(second)).toContain('in the settings');
    expect(third).toEqual(question.suggestedAnswers?.[2]);
    expect(first).toMatchObject({ recommended: true, citations: [{ path: 'src/Data/Db.cs' }] });
  });

  it('RF-645 no secret of a suggested answer survives masking a card list', () => {
    const [masked] = maskCardText([question], new SecretMasker());

    expect(JSON.stringify(masked)).not.toMatch(/FAKE-[AD]1/u);
  });

  it('RF-645 an OQ card saved before suggested answers is masked without them', () => {
    expect(maskCard(saved, new SecretMasker())).not.toHaveProperty('suggestedAnswers');
  });
});
