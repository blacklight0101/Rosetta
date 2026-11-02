import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { builtByPeople, handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-637, RF-645, DEC-184, ADR-013, P7-17: the answered build method lists its three options with none
// recommended; the principles have their own intro; hostile text in an option bullet stays inline.

const masker = new SecretMasker();
const NL = String.fromCharCode(10);

function questionsOf(extra: Record<string, unknown>): string {
  const base = builtByPeople(handoffOf('Plain text.'));
  return renderHandoff({ ...base, ...extra }, masker)['open-questions.md'] ?? '';
}

describe('open-questions.md: the build method options', () => {
  it('P7-17 RF-645 an answered build method section lists the three options, none recommended', () => {
    const base = builtByPeople(handoffOf('Plain text.'));
    const brief = {
      ...base.brief,
      defaulted: base.brief.defaulted.filter((id) => id !== 'buildMethod'),
      typed: { buildMethod: 'We build it ourselves.' },
    };
    const text = renderHandoff({ ...base, briefQuestions: [], brief }, masker)['open-questions.md'];
    const section = (text ?? '').slice((text ?? '').indexOf('## Build method'));

    expect(section).toContain('Suggested answers, none recommended');
    expect(section).toContain('1. Agents will build - ');
    expect(section).toContain('2. People will build - ');
    expect(section).toContain('3. Agents build, people review each change - ');
    expect(section).not.toContain('(Recommended)');
  });
});

describe('open-questions.md: the intro and the escaping of the options', () => {
  it('P7-17 the principles have their own intro: the defaults first', () => {
    const text = questionsOf({
      briefQuestions: [{ id: 'principles', question: 'Which?', answer: 'SOLID' }],
      briefOptions: {
        principles: [
          { answer: 'SOLID', description: 'On.', recommended: true },
          { answer: 'KISS', description: 'On.', recommended: true },
          { answer: 'Patterns', description: 'Off.', recommended: false },
        ],
      },
    });

    expect(text).toContain('Suggested answers, the defaults first;');
    expect(text).not.toContain('Suggested answers, the recommended one first');
  });

  it('P7-17 ADR-013 hostile text in an option bullet stays inline text', () => {
    const text = questionsOf({
      briefQuestions: [{ id: 'migration', question: '# Heading <b>x</b> | cell', answer: 'A' }],
      briefOptions: {
        migration: [
          {
            ...{ answer: '<img src=x onerror=1> [l](http://e)', recommended: true },
            description: '`code`' + NL + '# h',
          },
        ],
      },
    });
    const bullet = text.split(NL).find((each) => each.includes('(migration)')) ?? '';

    expect(bullet.startsWith('- ')).toBe(true);
    expect(bullet).not.toMatch(/(?<!\\)</u);
    expect(text).not.toMatch(/(?<!\\)<img/u);
    expect(text).not.toMatch(/^# h/mu);
  });
});
