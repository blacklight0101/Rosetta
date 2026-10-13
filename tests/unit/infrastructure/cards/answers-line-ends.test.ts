import { describe, expect, it } from 'vitest';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-240, RF-1007, data-model.md section 3.16: `answers.md` can be saved by any editor, so a file
// with CRLF or lone CR (old Mac) line ends, or with a byte-order mark before its first heading, is
// read like a plain LF file, keeps its other answers, and is written back with its own line ends
// and its mark.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;
const run = '20261012-100000-understand';
const BOM = '﻿';

const fixture = [
  '## OQ-001 - Is a sold-out item shown?',
  '',
  `- Card: runs/${run}/cards/OQ/OQ-001.md`,
  '- Context: Catalog/Default.aspx.cs:1-4 stock',
  '- Answer: Yes, greyed.',
  '',
  '## OQ-002 - Who may edit prices?',
  '',
  `- Card: runs/${run}/cards/OQ/OQ-002.md`,
  '- Context: Catalog/Default.aspx.cs:5-8 prices',
  '- Answer:',
  '',
];

const newQuestion = {
  cardId: 'OQ-003',
  runKey: run,
  question: 'Who may cancel an order?',
  context: 'Orders/Cancel.aspx.cs:1-9 cancel',
};

function setup(text: string) {
  const writer = new MemoryOutputWriter();
  writer.files.set(path, text);
  return { writer, answers: new FileAnswersFile({ writer, masker: new SecretMasker() }) };
}

/** The line ends of a text, in order, so a mixed file shows up as more than one kind. */
function lineEnds(text: string): Set<string> {
  return new Set(text.match(/\r\n|\r|\n/gu) ?? []);
}

const listed = [
  {
    cardId: 'OQ-001',
    question: 'Is a sold-out item shown?',
    context: 'Catalog/Default.aspx.cs:1-4 stock',
    answer: 'Yes, greyed.',
  },
  {
    cardId: 'OQ-002',
    question: 'Who may edit prices?',
    context: 'Catalog/Default.aspx.cs:5-8 prices',
    answer: '',
  },
];

describe('answers.md appends keep the file line ends', () => {
  it('RF-240 an append to a CRLF file leaves only CRLF line ends', async () => {
    const { writer, answers } = setup(fixture.join('\r\n'));

    await answers.addQuestions(project, [newQuestion]);

    const text = writer.files.get(path) ?? '';
    expect(text).toContain('## OQ-003 - Who may cancel an order?\r\n');
    expect(lineEnds(text)).toEqual(new Set(['\r\n']));
    expect(await answers.questionsOf(project, run)).toHaveLength(3);
  });
});

describe('answers.md with lone CR line ends', () => {
  it('RF-1007 lists the questions of a lone-CR file with their answers', async () => {
    const { answers } = setup(fixture.join('\r'));

    expect(await answers.questionsOf(project, run)).toEqual(listed);
  });

  it('RF-1007 saves an answer into a lone-CR file, keeps the other answer and its line ends', async () => {
    const { writer, answers } = setup(fixture.join('\r'));

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-002', answer: 'Managers.' }]);

    const expected = [...fixture];
    expected[10] = '- Answer: Managers.';
    expect(writer.files.get(path)).toBe(expected.join('\r'));
  });

  it('RF-240 an append to a lone-CR file skips known questions and keeps CR line ends', async () => {
    const { writer, answers } = setup(fixture.join('\r'));

    await answers.addQuestions(project, [{ ...newQuestion, question: 'Who may edit prices?' }]);
    expect(writer.files.get(path)).toBe(fixture.join('\r'));

    await answers.addQuestions(project, [newQuestion]);
    const text = writer.files.get(path) ?? '';
    expect(lineEnds(text)).toEqual(new Set(['\r']));
    expect(text.startsWith(fixture.join('\r').trimEnd())).toBe(true);
  });
});

describe('answers.md with a byte-order mark before a heading', () => {
  it('RF-1007 lists the first question behind the mark', async () => {
    const { answers } = setup(`${BOM}${fixture.join('\n')}`);

    expect(await answers.questionsOf(project, run)).toEqual(listed);
  });

  it('RF-1007 saves the answer of the question behind the mark and keeps the mark', async () => {
    const { writer, answers } = setup(`${BOM}${fixture.join('\r\n')}`);

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-001', answer: 'No.' }]);

    const expected = [...fixture];
    expected[4] = '- Answer: No.';
    expect(writer.files.get(path)).toBe(`${BOM}${expected.join('\r\n')}`);
  });

  it('RF-240 an append keeps the mark and does not add the first question again', async () => {
    const { writer, answers } = setup(`${BOM}${fixture.join('\n')}`);

    await answers.addQuestions(project, [
      { ...newQuestion, cardId: 'OQ-001', question: 'Is a sold-out item shown?' },
      newQuestion,
    ]);

    const text = writer.files.get(path) ?? '';
    expect(text.startsWith(`${BOM}## OQ-001 - Is a sold-out item shown?\n`)).toBe(true);
    expect(text.split('Is a sold-out item shown?')).toHaveLength(2);
    expect(text).toContain('## OQ-003 - Who may cancel an order?\n');
  });
});
