import { describe, expect, it } from 'vitest';
import type { OpenQuestion } from '../../../../src/application/ports/answers-file.js';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-646, RF-243, Q-52, DEC-179: a question that asks the same as one the project's answers.md already
// holds (the same words, whatever the case and marks) is merged into it: it gets no section, and the
// answer of the held one stays the only one. Whether the held one is answered or not.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;

function question(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    cardId: 'OQ-001',
    runKey: '20261012-100000-understand',
    question: 'Is a catalog item with zero stock still shown?',
    context: 'Catalog/Default.aspx.cs:41-58 The list filters on the stock.',
    ...overrides,
  };
}

function setup() {
  const writer = new MemoryOutputWriter();
  return { writer, answers: new FileAnswersFile({ writer, masker: new SecretMasker() }) };
}

const later = { cardId: 'OQ-007', runKey: '20261013-090000-deepen' };

describe('answers.md and a question asked again in other words', () => {
  it('RF-646 merges a question that asks the same as an answered one and keeps its answer', async () => {
    const { writer, answers } = setup();
    await answers.addQuestions(project, [question()]);
    writer.files.set(path, (writer.files.get(path) ?? '').replace('- Answer:', '- Answer: Yes.'));

    await answers.addQuestions(project, [
      question({ ...later, question: 'is a CATALOG item with zero stock still shown' }),
    ]);

    const text = writer.files.get(path) ?? '';
    expect(text.match(/^## /gmu)).toHaveLength(1);
    expect(text).toContain('- Answer: Yes.');
    expect(await answers.answeredQuestions(project)).toHaveLength(1);
  });

  it('RF-646 merges an unanswered question raised again, so it is not listed twice', async () => {
    const { writer, answers } = setup();
    await answers.addQuestions(project, [question()]);

    await answers.addQuestions(project, [
      question({ ...later, question: 'Is a catalog item with zero stock, still shown!' }),
    ]);

    expect(writer.files.get(path)?.match(/^## /gmu)).toHaveLength(1);
  });

  it('RF-646 adds a question that asks something else', async () => {
    const { writer, answers } = setup();
    await answers.addQuestions(project, [question()]);

    await answers.addQuestions(project, [
      question({ ...later, question: 'Who may cancel an order?' }),
    ]);

    expect(writer.files.get(path)?.match(/^## /gmu)).toHaveLength(2);
  });
});
