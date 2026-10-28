import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';

// RF-612, RF-637, P6-11: when people build, the README says in one sentence what the package
// leaves out, and open-questions.md lists the build method as a whole-build question with its
// default. An agent build says neither.

const masker = new SecretMasker();
const leftOutSentence =
  'This package has no agent files, no model per card and no build protocol, because people build the system.';

function filesOf(aiAssisted: boolean, defaulted = false): Readonly<Record<string, string>> {
  const base = handoffOf('Plain text.');
  const briefQuestions = defaulted ? [buildMethodDefault] : [];
  return renderHandoff(
    { ...base, briefQuestions, brief: { ...base.brief, buildMethod: { aiAssisted } } },
    masker,
  );
}

const buildMethodDefault = {
  id: 'buildMethod',
  question: 'Will the team build the new system with AI agents?',
  answer: 'No; the package has no AI-assisted build method.',
};

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe('the package says what it leaves out when people build', () => {
  it('RF-612 people building: the README says in one sentence what the package leaves out', () => {
    const readme = filesOf(false)['README.md'] ?? '';

    expect(readme.split(leftOutSentence)).toHaveLength(2);
  });

  it('RF-612 agents building: the README does not say what the package leaves out', () => {
    const readme = filesOf(true)['README.md'] ?? '';

    expect(readme).not.toContain('no build protocol');
    expect(readme).not.toContain(leftOutSentence);
  });

  it('RF-637 people building: open-questions.md lists the build method as a whole-build question with its default', () => {
    const questions = filesOf(false)['open-questions.md'] ?? '';

    expect(questions).toMatch(/^## Build method$/mu);
    expect(questions).toContain('whole-build question, so no card waits on it');
    expect(questions).toContain('Default: people build');
    expect(questions).toContain('answer the question again to add them');
  });

  it('RF-637 agents building: open-questions.md has no build method question', () => {
    const questions = filesOf(true)['open-questions.md'] ?? '';

    expect(questions).not.toMatch(/^## Build method$/mu);
    expect(questions).not.toContain('Default: people build');
  });

  it('RF-637 people building by default: open-questions.md lists the build method once, in the defaulted table', () => {
    const questions = filesOf(false, true)['open-questions.md'] ?? '';

    expect(questions).not.toMatch(/^## Build method$/mu);
    expect(occurrences(questions, buildMethodDefault.question)).toBe(1);
    expect(questions).toContain(
      `| ${buildMethodDefault.question} | buildMethod | ${buildMethodDefault.answer} | none |`,
    );
  });

  it('RF-637 people building by answer: open-questions.md lists the build method once, as its own section', () => {
    const questions = filesOf(false)['open-questions.md'] ?? '';

    expect(questions.match(/^## Build method$/gmu)).toHaveLength(1);
    expect(questions).not.toContain(buildMethodDefault.question);
    expect(questions).toContain('Every question of the brief was answered.');
  });
});
