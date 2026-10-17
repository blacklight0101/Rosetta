import { describe, expect, it } from 'vitest';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-241, RF-1007, data-model.md section 3.16: the answered questions of answers.md are the sections
// whose answer line holds text; the run comes from the card line, which a person can edit.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;

function section(id: string, card: string, answer: string): string {
  return [
    `## ${id} - Question ${id}?`,
    '',
    `- Card: ${card}`,
    `- Context: Context ${id}`,
    answer,
  ].join('\n');
}

function answeredIn(...sections: string[]) {
  const writer = new MemoryOutputWriter();
  writer.files.set(path, `# Answers to open questions\n\n${sections.join('\n\n')}\n`);
  return new FileAnswersFile({ writer, masker: new SecretMasker() }).answeredQuestions(project);
}

const card = (id: string) => `runs/20261012-100000-understand/cards/OQ/${id}.md`;

describe('the answered questions of answers.md', () => {
  it('RF-241 lists the sections with an answer, with their run, question and context', async () => {
    const answered = await answeredIn(
      section('OQ-001', card('OQ-001'), '- Answer: Yes, always.'),
      section('OQ-002', card('OQ-002'), '- Answer:'),
    );

    expect(answered).toEqual([
      {
        cardId: 'OQ-001',
        runKey: '20261012-100000-understand',
        question: 'Question OQ-001?',
        context: 'Context OQ-001',
        answer: 'Yes, always.',
      },
    ]);
  });

  it('RF-241 ignores a section whose card line names no plain run folder or a different card', async () => {
    const answered = await answeredIn(
      section('OQ-001', 'runs/../../other/cards/OQ/OQ-001.md', '- Answer: a'),
      section('OQ-002', card('OQ-009'), '- Answer: b'),
      section('OQ-003', 'elsewhere.md', '- Answer: c'),
    );

    expect(answered).toEqual([]);
  });
});

describe('the run named by a card line', () => {
  it('RF-241 takes a card line whose run folder is a dot segment or not a run name for no run', async () => {
    const answered = await answeredIn(
      section('OQ-001', 'runs/../cards/OQ/OQ-001.md', '- Answer: a'),
      section('OQ-002', 'runs/not a run/cards/OQ/OQ-002.md', '- Answer: b'),
    );

    expect(answered).toEqual([]);
  });
});
