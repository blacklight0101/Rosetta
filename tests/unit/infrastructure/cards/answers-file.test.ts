import { describe, expect, it } from 'vitest';
import type { OpenQuestion } from '../../../../src/application/ports/answers-file.js';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-240, DEC-98, data-model.md section 3.16: the project's answers.md lists every open question
// with its card id, run, context and an answer field, and never loses an answer already written.

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

describe('answers.md', () => {
  it('RF-240 lists each open question with its card id, card file, context and an empty answer', async () => {
    const { writer, answers } = setup();

    await answers.addQuestions(project, [question()]);

    expect(writer.files.get(path)).toBe(
      [
        '# Answers to open questions',
        '',
        '## OQ-001 - Is a catalog item with zero stock still shown?',
        '',
        '- Card: runs/20261012-100000-understand/cards/OQ/OQ-001.md',
        '- Context: Catalog/Default.aspx.cs:41-58 The list filters on the stock.',
        '- Answer:',
        '',
      ].join('\n'),
    );
  });

  it('RF-240 keeps an existing answer when a later run adds its questions', async () => {
    const { writer, answers } = setup();
    await answers.addQuestions(project, [question()]);
    const answered = (writer.files.get(path) ?? '').replace(
      '- Answer:',
      '- Answer: Yes, it is shown as out of stock.',
    );
    writer.files.set(path, answered);

    await answers.addQuestions(project, [
      question({
        cardId: 'OQ-001',
        runKey: '20261013-090000-understand',
        question: 'Who may cancel an order?',
      }),
    ]);

    const text = writer.files.get(path) ?? '';
    expect(text).toContain('- Answer: Yes, it is shown as out of stock.');
    expect(text).toContain('## OQ-001 - Who may cancel an order?');
    expect(text.indexOf('zero stock')).toBeLessThan(text.indexOf('Who may cancel'));
  });
});

describe('answers.md and the questions already in it', () => {
  it('RF-240 a question already in the file is not added again, so its answer stays the only one', async () => {
    const { writer, answers } = setup();
    await answers.addQuestions(project, [question()]);
    writer.files.set(path, (writer.files.get(path) ?? '').replace('- Answer:', '- Answer: Yes.'));

    await answers.addQuestions(project, [
      question({ cardId: 'OQ-004', runKey: '20261013-090000-understand' }),
    ]);

    const text = writer.files.get(path) ?? '';
    expect(text.match(/zero stock/g)).toHaveLength(1);
    expect(text).toContain('- Answer: Yes.');
  });
});

describe('answers.md and model text', () => {
  it('RF-240 model text cannot add a heading or a line: it is written on one escaped line', async () => {
    const { writer, answers } = setup();

    await answers.addQuestions(project, [
      question({ question: 'Shown?\n## OQ-999 - Injected\n- Answer: done', context: 'a\nb' }),
    ]);

    const text = writer.files.get(path) ?? '';
    expect(text.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(1);
    expect(text.split('\n').filter((line) => line.startsWith('- Answer:'))).toEqual(['- Answer:']);
  });

  it('RF-240 a run without open questions leaves the file as it was', async () => {
    const { writer, answers } = setup();

    await answers.addQuestions(project, []);

    expect(writer.files.has(path)).toBe(false);
  });
});
