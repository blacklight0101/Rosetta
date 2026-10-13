import { describe, expect, it } from 'vitest';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-1007, data-model.md section 3.16: `answers.md` can be edited in any editor, so a file saved with
// CRLF line ends is read like one with LF, and the answers written into it keep its line ends.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;
const run = '20261012-100000-understand';

const fixture = [
  '# Answers to open questions',
  '',
  '## OQ-001 - Is a sold-out item shown?',
  '',
  `- Card: runs/${run}/cards/OQ/OQ-001.md`,
  '- Context: Catalog/Default.aspx.cs:1-4 stock',
  '- Answer:',
  '',
  '## OQ-002 - Who may edit prices?',
  '',
  `- Card: runs/${run}/cards/OQ/OQ-002.md`,
  '- Context: Catalog/Default.aspx.cs:5-8 prices',
  '',
];

function setup(lineEnd: string) {
  const writer = new MemoryOutputWriter();
  writer.files.set(path, fixture.join(lineEnd));
  return { writer, answers: new FileAnswersFile({ writer, masker: new SecretMasker() }) };
}

describe('answers.md with CRLF line ends', () => {
  it('RF-1007 lists the questions of a CRLF file', async () => {
    const { answers } = setup('\r\n');

    expect(await answers.questionsOf(project, run)).toEqual([
      {
        cardId: 'OQ-001',
        question: 'Is a sold-out item shown?',
        context: 'Catalog/Default.aspx.cs:1-4 stock',
        answer: '',
      },
      {
        cardId: 'OQ-002',
        question: 'Who may edit prices?',
        context: 'Catalog/Default.aspx.cs:5-8 prices',
        answer: '',
      },
    ]);
  });

  it('RF-1007 saves answers into a CRLF file and keeps its line ends', async () => {
    const { writer, answers } = setup('\r\n');

    const outcome = await answers.recordAnswers(project, run, [
      { cardId: 'OQ-001', answer: 'Yes, greyed.' },
      { cardId: 'OQ-002', answer: 'Managers.' },
    ]);

    expect(outcome.ok).toBe(true);
    const expected = fixture.map((line) => line);
    expected[6] = '- Answer: Yes, greyed.';
    expected.splice(11 + 1, 0, '- Answer: Managers.');
    expect(writer.files.get(path)).toBe(expected.join('\r\n'));
    expect(writer.files.get(path)?.replace(/\r\n/gu, '')).not.toContain('\n');
  });

  it('RF-1007 saves answers into an LF file and keeps its line ends', async () => {
    const { writer, answers } = setup('\n');

    await answers.recordAnswers(project, run, [{ cardId: 'OQ-001', answer: 'Yes.' }]);

    expect(writer.files.get(path)).not.toContain('\r');
    expect(writer.files.get(path)).toContain('- Answer: Yes.\n');
  });
});
