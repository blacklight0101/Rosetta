import { describe, expect, it } from 'vitest';
import { keepLegacyDefault } from '../../../../src/domain/planning/legacy-default.js';
import type { HandoffPackage } from '../../../../src/application/plan/handoff-package.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { builtByPeople, handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-637, RF-645, DEC-189, P6-31: when the "Default:" line of an analysis question and its
// recommended suggested answer differ, the package says so in one sentence; a brief question that
// took its default lists the Plan setup options; the build method has no recommended option.

const masker = new SecretMasker();
const sentence = 'The recommended answer differs from the default the package used';

const others = [
  { answer: 'Drop the rule', description: 'Simpler.', recommended: false },
  { answer: 'Keep it with a limit', description: 'A middle way.', recommended: false },
];

function openQuestions(extra: Partial<HandoffPackage>, base?: HandoffPackage): string {
  const handoff = { ...(base ?? handoffOf('Plain text.')), ...extra };
  return renderHandoff(handoff, masker)['open-questions.md'] ?? '';
}

function analysis(options: HandoffPackage['openQuestions'][number]['options']): string {
  return openQuestions({
    openQuestions: [{ cardId: 'OQ-001', question: 'Who cancels?', area: 'orders', options }],
  });
}

describe('open-questions.md: the default line against the recommended answer', () => {
  it('RF-645 DEC-189 says so in one sentence when they differ', () => {
    const text = analysis([
      { answer: 'Only the owner', description: 'Safest.', recommended: true },
      ...others,
    ]);

    expect(text.split(sentence)).toHaveLength(2);
    expect(text).toMatch(
      /\n {2}The recommended answer differs from the default the package used[^\n]*\.\n/u,
    );
  });

  it('RF-645 DEC-189 says nothing when the recommended answer is the default', () => {
    const text = analysis([
      { answer: keepLegacyDefault, description: 'Users see no change.', recommended: true },
      ...others,
    ]);

    expect(text).not.toContain(sentence);
    expect(text).toContain('(Recommended)');
  });

  it('RF-645 says nothing for a question with no suggested answers or no recommended one', () => {
    expect(analysis(undefined)).not.toContain(sentence);
    expect(
      analysis([{ answer: 'A', description: 'a.', recommended: false }, ...others]),
    ).not.toContain(sentence);
  });

  it('RF-645 ADR-013 the sentence holds no text of the model', () => {
    const text = analysis([{ answer: '<b>x</b>', description: 'd', recommended: true }, ...others]);
    const line = text.split('\n').find((each) => each.includes(sentence)) ?? '';

    expect(line).not.toBe('');
    expect(line).not.toContain('<b>');
  });
});

describe('open-questions.md: options under a brief question that took its default', () => {
  const options = {
    migration: [
      { answer: 'Strangler Fig', description: 'Small risk.', recommended: true },
      { answer: 'Parallel Change', description: 'Undoable.', recommended: false },
      { answer: 'Full rewrite', description: 'All at once.', recommended: false },
    ],
    buildMethod: [
      { answer: 'Agents will build', description: 'Adds the agent method.', recommended: false },
      { answer: 'People will build', description: 'Plan only.', recommended: false },
      { answer: 'Agents build, people review', description: 'Same package.', recommended: false },
    ],
  };
  const base = builtByPeople(handoffOf('Plain text.'));
  const text = openQuestions(
    {
      briefQuestions: [
        { id: 'migration', question: 'How to move?', answer: 'Strangler Fig' },
        { id: 'buildMethod', question: 'Will agents build?', answer: 'No.' },
      ],
      briefOptions: options,
    },
    base,
  );

  it('RF-637 RF-645 lists the Plan setup options with the recommended one first and marked', () => {
    expect(text).toContain('1. Strangler Fig (Recommended) - Small risk.');
    expect(text).toContain('2. Parallel Change - Undoable.');
    expect(text).toContain('3. Full rewrite - All at once.');
  });

  it('RF-645 DEC-184 the build method lists its options with none marked recommended', () => {
    const lines = text.split('\n').filter((each) => /^\s+\d\. Agents/u.test(each));

    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).not.toContain('Recommended');
    expect(text).toContain('2. People will build - Plan only.');
  });

  it('RF-645 the table of defaults keeps its columns', () => {
    expect(text).toContain('| Question | Id | Default the package used | Cards waiting |');
  });

  it('RF-645 a question with no options is listed as before', () => {
    const before = openQuestions({}, base);

    expect(before).not.toContain('Strangler Fig (Recommended)');
  });
});
