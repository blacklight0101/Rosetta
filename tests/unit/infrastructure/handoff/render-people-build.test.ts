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

function filesOf(aiAssisted: boolean): Readonly<Record<string, string>> {
  const base = handoffOf('Plain text.');
  return renderHandoff({ ...base, brief: { ...base.brief, buildMethod: { aiAssisted } } }, masker);
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
});
