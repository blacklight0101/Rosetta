import { describe, expect, it } from 'vitest';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-240, RF-1007, data-model.md section 3.16: an `answers.md` that holds only a byte-order mark
// keeps the mark, and a file whose lines end in different ways (some CRLF, some LF) keeps each
// line's own end; a new line takes the end of the line before it.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;
const run = '20261012-100000-understand';
const BOM = '﻿';

const newQuestion = {
  cardId: 'OQ-003',
  runKey: run,
  question: 'Who may cancel an order?',
  context: 'Orders/Cancel.aspx.cs:1-9 cancel',
};

// A CRLF title, an LF first section and a second section whose lines mix both ends; the second
// section has no answer line.
const mixed =
  '# Answers to open questions\r\n\r\n' +
  '## OQ-001 - Is a sold-out item shown?\n\n' +
  `- Card: runs/${run}/cards/OQ/OQ-001.md\n` +
  '- Context: Catalog/Default.aspx.cs:1-4 stock\n' +
  '- Answer:\n\n' +
  '## OQ-002 - Who may edit prices?\r\n\n' +
  `- Card: runs/${run}/cards/OQ/OQ-002.md\r\n` +
  '- Context: Catalog/Default.aspx.cs:5-8 prices\n';

function setup(text: string) {
  const writer = new MemoryOutputWriter();
  writer.files.set(path, text);
  return { writer, answers: new FileAnswersFile({ writer, masker: new SecretMasker() }) };
}

describe('answers.md that holds only a byte-order mark', () => {
  it('RF-240 the first append keeps the mark before the title', async () => {
    const { writer, answers } = setup(BOM);

    await answers.addQuestions(project, [newQuestion]);

    const text = writer.files.get(path) ?? '';
    expect(text.startsWith(`${BOM}# Answers to open questions\n\n## OQ-003 - `)).toBe(true);
    expect(text.split(BOM)).toHaveLength(2);
  });

  it('RF-1007 an answer recorded after the first append keeps the mark', async () => {
    const { writer, answers } = setup(BOM);
    await answers.addQuestions(project, [newQuestion]);

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-003', answer: 'Managers.' }]);

    const text = writer.files.get(path) ?? '';
    expect(text.startsWith(`${BOM}# Answers to open questions\n`)).toBe(true);
    expect(text).toContain('- Answer: Managers.\n');
  });
});

describe('answers.md with mixed line ends', () => {
  it('RF-1007 recording an answer changes only its answer line, byte for byte', async () => {
    const { writer, answers } = setup(mixed);

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-001', answer: 'Yes, greyed.' }]);

    expect(writer.files.get(path)).toBe(mixed.replace('- Answer:\n', '- Answer: Yes, greyed.\n'));
  });

  it('RF-1007 an added answer line takes the end of the line before it', async () => {
    const { writer, answers } = setup(mixed);

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-002', answer: 'Managers.' }]);

    expect(writer.files.get(path)).toBe(`${mixed}- Answer: Managers.\n`);
  });

  it('RF-1007 an added answer line after a CRLF line ends in CRLF', async () => {
    const text = mixed.replace('5-8 prices\n', '5-8 prices\r\n');
    const { writer, answers } = setup(text);

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-002', answer: 'Managers.' }]);

    expect(writer.files.get(path)).toBe(`${text}- Answer: Managers.\r\n`);
  });

  it('RF-1007 an answer line added after a last line without an end takes the end before it', async () => {
    const text = mixed.replace('5-8 prices\n', '5-8 prices');
    const { writer, answers } = setup(text);

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-002', answer: 'Managers.' }]);

    expect(writer.files.get(path)).toBe(`${text}\r\n- Answer: Managers.`);
  });
});

describe('answers.md with mixed line ends, appended to', () => {
  it('RF-240 an append keeps the file byte for byte and uses the end of its last line', async () => {
    const { writer, answers } = setup(mixed);

    await answers.addQuestions(project, [newQuestion]);

    const text = writer.files.get(path) ?? '';
    expect(text.startsWith(mixed)).toBe(true);
    expect(text.slice(mixed.length)).toBe(
      [
        '',
        '## OQ-003 - Who may cancel an order?',
        '',
        `- Card: runs/${run}/cards/OQ/OQ-003.md`,
        '- Context: Orders/Cancel.aspx.cs:1-9 cancel',
        '- Answer:',
        '',
      ].join('\n'),
    );
  });
});
