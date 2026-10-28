import { describe, expect, it } from 'vitest';
import type { OpenQuestion } from '../../../../src/application/ports/answers-file.js';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-645, RF-1007, RF-240, DEC-178, data-model.md section 3.16: an open question with suggested answers
// gets an `- Options:` line and an empty `- Chosen:` line; the page records which option was chosen,
// or that the answer was typed. A section without options keeps its free answer field.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;
const run = '20261012-100000-understand';

const options = [
  {
    answer: 'Yes, show it',
    description: 'Keep the list as it is; sold-out items stay.',
    recommended: true,
  },
  { answer: 'No, hide it', description: 'Hide sold-out items.', recommended: false },
  { answer: 'Yes, with a condition', description: 'Name the condition.', recommended: false },
] as const;

function withOptions(): OpenQuestion {
  return {
    cardId: 'OQ-001',
    runKey: run,
    question: 'Is a sold-out item shown?',
    context: 'Catalog/Default.aspx.cs:1-4 x',
    options,
  };
}

const plain: OpenQuestion = {
  cardId: 'OQ-002',
  runKey: run,
  question: 'Who may edit prices?',
  context: 'Catalog/Edit.aspx.cs:3-9 y',
};

async function setup() {
  const writer = new MemoryOutputWriter();
  const answers = new FileAnswersFile({ writer, masker: new SecretMasker() });
  await answers.addQuestions(project, [withOptions(), plain]);
  return { writer, answers };
}

const textOf = (writer: MemoryOutputWriter): string => writer.files.get(path) ?? '';

describe('answers.md and the suggested answers', () => {
  it('RF-645 writes the options with the recommended one first and an empty Chosen line', async () => {
    const { writer } = await setup();

    const text = textOf(writer);
    expect(text).toContain(
      '- Options: (Recommended) Yes, show it - Keep the list as it is, sold-out items stay.; ' +
        'No, hide it - Hide sold-out items.; Yes, with a condition - Name the condition.\n' +
        '- Chosen:\n- Answer:',
    );
    const legacy = text.slice(text.indexOf('## OQ-002'));
    expect(legacy).not.toContain('- Options:');
    expect(legacy).not.toContain('- Chosen:');
  });

  it('RF-645 lists the options of a question and none for a question without them', async () => {
    const { answers } = await setup();

    const [first, second] = await answers.questionsOf(project, run);

    expect(first?.options).toEqual([
      {
        answer: 'Yes, show it',
        description: 'Keep the list as it is, sold-out items stay.',
        recommended: true,
      },
      { answer: 'No, hide it', description: 'Hide sold-out items.', recommended: false },
      { answer: 'Yes, with a condition', description: 'Name the condition.', recommended: false },
    ]);
    expect(first?.chosen).toBe('');
    expect(second?.options).toBeUndefined();
    expect(second?.chosen).toBeUndefined();
  });
});

describe('answers.md and the chosen option', () => {
  it('RF-1007 RF-645 choosing option 2 writes its answer and the number of the option', async () => {
    const { writer, answers } = await setup();

    const outcome = await answers.recordAnswers(project, run, [
      { cardId: 'OQ-001', answer: 'ignored', chosen: 2 },
    ]);

    expect(textOf(writer)).toContain('- Chosen: 2\n- Answer: No, hide it\n');
    expect(outcome.ok && outcome.value[0]?.chosen).toBe('2');
    expect(outcome.ok && outcome.value[0]?.answer).toBe('No, hide it');
  });

  it('RF-1007 RF-645 a typed answer is recorded as typed', async () => {
    const { writer, answers } = await setup();

    await answers.recordAnswers(project, run, [
      { cardId: 'OQ-001', answer: 'Only for staff.', chosen: 'typed' },
    ]);

    expect(textOf(writer)).toContain('- Chosen: typed\n- Answer: Only for staff.\n');
  });

  it('RF-1007 RF-645 clearing the answer empties the Chosen line', async () => {
    const { writer, answers } = await setup();
    await answers.recordAnswers(project, run, [{ cardId: 'OQ-001', answer: 'x', chosen: 'typed' }]);

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-001', answer: '' }]);

    expect(textOf(writer)).toContain('- Chosen:\n- Answer:\n');
  });
});

describe('answers.md and refused or old questions', () => {
  it('RF-645 an option number the question does not have changes nothing', async () => {
    const { writer, answers } = await setup();
    const before = textOf(writer);

    const outcome = await answers.recordAnswers(project, run, [
      { cardId: 'OQ-001', answer: 'x', chosen: 4 },
    ]);

    expect(outcome).toEqual({ ok: false, error: 'invalid-choice' });
    expect(textOf(writer)).toBe(before);
  });

  it('RF-645 a question saved before the change keeps its free answer field', async () => {
    const { writer, answers } = await setup();

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-002', answer: 'Managers.' }]);

    const text = textOf(writer);
    const legacy = text.slice(text.indexOf('## OQ-002'));
    expect(legacy).toContain('- Answer: Managers.');
    expect(legacy).not.toContain('- Chosen:');
  });

  it('RF-645 a suggested answer cannot start a line or another option', async () => {
    const writer = new MemoryOutputWriter();
    const answers = new FileAnswersFile({ writer, masker: new SecretMasker() });
    await answers.addQuestions(project, [
      {
        ...withOptions(),
        options: [
          { answer: 'A - b; c\n## OQ-9 - x', description: 'd; e\n- Answer: z', recommended: true },
          { answer: 'B', description: 'two', recommended: false },
          { answer: 'C', description: 'three', recommended: false },
        ],
      },
    ]);

    const [question] = await answers.questionsOf(project, run);

    expect(question).toMatchObject({
      options: [{ recommended: true }, { recommended: false }, { recommended: false }],
    });
    expect(
      textOf(writer)
        .split('\n')
        .filter((line) => line.startsWith('## ')),
    ).toHaveLength(1);
  });
});
