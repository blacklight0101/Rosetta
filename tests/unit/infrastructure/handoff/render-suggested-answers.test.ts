import { describe, expect, it } from 'vitest';
import { dangerousIn } from '../../../support/render-markdown.js';
import { keepLegacyDefault } from '../../../../src/domain/planning/legacy-default.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { builtByPeople, handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-637, RF-645, DEC-178, DEC-184: each open question of the package lists its suggested answers,
// the recommended one first, and says a team may answer otherwise; a question with none is listed
// as before. Suggested-answer text comes from a model, so it shows as text (ADR-013).

const masker = new SecretMasker();

const options = [
  { answer: 'Keep the rule', description: 'Users see no change.', recommended: true },
  { answer: 'Drop the rule', description: 'Simpler, but a change for users.', recommended: false },
  { answer: 'Keep it with a limit', description: 'Keeps most behaviour.', recommended: false },
];

function withQuestions(
  openQuestions: HandoffPackage['openQuestions'],
  base: HandoffPackage = handoffOf('Plain text.'),
): string {
  return renderHandoff({ ...base, openQuestions }, masker)['open-questions.md'] ?? '';
}

describe('renderHandoff: suggested answers in the open questions', () => {
  const text = withQuestions([
    { cardId: 'OQ-001', question: 'Who cancels?', area: 'orders', options },
    { cardId: 'OQ-002', question: 'Which tax?', area: 'orders' },
  ]);
  const section = text.split(/^## /mu).find((part) => part.startsWith('Questions from the')) ?? '';
  const [withAnswers = '', without = ''] = section.split('- OQ-002:').map((part) => part.trim());

  it('RF-637 RF-645 a question lists its suggested answers, the recommended one first and marked', () => {
    const lines = withAnswers.split('\n');
    const first = lines.findIndex((line) => line.includes('Keep the rule'));
    const second = lines.findIndex((line) => line.includes('Drop the rule'));
    const third = lines.findIndex((line) => line.includes('Keep it with a limit'));

    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(third);
    expect(lines[first]).toContain('(Recommended)');
    expect(lines[second]).not.toContain('(Recommended)');
    expect(lines[first]).toContain('Users see no change.');
  });

  it('RF-637 RF-645 the question says a team may answer otherwise', () => {
    expect(withAnswers).toContain('may answer otherwise');
  });

  it('RF-645 a question with no suggested answers is listed as before', () => {
    expect(without).toBe(`Which tax? Default: ${keepLegacyDefault} Cards waiting: none`);
  });
});

describe('renderHandoff: suggested answers and the build method', () => {
  it('RF-645 DEC-184 the build-method question of a people build marks no option recommended', () => {
    const base = builtByPeople(handoffOf('Plain text.'));
    const text = withQuestions([], { ...base, briefQuestions: [] });
    const section = text.split(/^## /mu).find((part) => part.startsWith('Build method')) ?? '';

    expect(section).not.toBe('');
    expect(section).not.toContain('(Recommended)');
  });
});

describe('renderHandoff: hostile suggested answers', () => {
  const token = ['ghp', 'a1B2'.repeat(9)].join('_');
  const hostile = `<script>alert(1)</script> | [x](javascript:alert(1)) ${token}`;

  const text = withQuestions([
    {
      cardId: 'OQ-001',
      question: 'Who cancels?',
      area: 'orders',
      options: [
        { answer: hostile, description: hostile, recommended: true },
        { answer: `# ${hostile}`, description: `\n- ${hostile}`, recommended: false },
        { answer: 'Fine', description: 'Fine.', recommended: false },
      ],
    },
  ]);

  it('RF-645 ADR-013 the answer and description show as text and no token survives', () => {
    expect(dangerousIn(text)).toBeUndefined();
    expect(text).not.toContain(token.slice(4, 30));
  });

  it('RF-645 a hostile answer cannot add a heading or a list item of its own', () => {
    const lines = text.split('\n');

    expect(lines.filter((line) => /^#{1,6} .*alert/u.test(line))).toHaveLength(0);
    expect(lines.filter((line) => /^\s*- .*alert/u.test(line))).toHaveLength(0);
  });
});
