import { describe, expect, it } from 'vitest';
import type { OpenQuestion } from '../../../../src/application/ports/answers-file.js';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-1007, RF-240, data-model.md section 3.16: the page records the answers to the questions of one
// run in the project's answers.md; every other section and line stays as it was.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;
const first = '20261012-100000-understand';
const second = '20261012-110000-understand';

function question(cardId: string, runKey: string, text: string): OpenQuestion {
  return { cardId, runKey, question: text, context: `Catalog/Default.aspx.cs:1-4 ${text}` };
}

async function setup() {
  const writer = new MemoryOutputWriter();
  const answers = new FileAnswersFile({ writer, masker: new SecretMasker() });
  await answers.addQuestions(project, [
    question('OQ-001', first, 'Is a sold-out item shown?'),
    question('OQ-002', first, 'Who may edit prices?'),
  ]);
  await answers.addQuestions(project, [question('OQ-001', second, 'Are orders ever deleted?')]);
  return { writer, answers };
}

describe('answers.md and the page', () => {
  it('RF-1007 lists the questions of one run with their context and an empty answer', async () => {
    const { answers } = await setup();

    expect(await answers.questionsOf(project, first)).toEqual([
      {
        cardId: 'OQ-001',
        question: 'Is a sold-out item shown?',
        context: 'Catalog/Default.aspx.cs:1-4 Is a sold-out item shown?',
        answer: '',
      },
      {
        cardId: 'OQ-002',
        question: 'Who may edit prices?',
        context: 'Catalog/Default.aspx.cs:1-4 Who may edit prices?',
        answer: '',
      },
    ]);
    expect((await answers.questionsOf(project, second)).map((each) => each.cardId)).toEqual([
      'OQ-001',
    ]);
  });

  it('RF-1007 writes an answer into its section and keeps every other line', async () => {
    const { writer, answers } = await setup();
    const before = writer.files.get(path) ?? '';

    const outcome = await answers.recordAnswers(project, first, [
      { cardId: 'OQ-002', answer: 'Only the catalog manager.' },
    ]);

    expect(outcome.ok).toBe(true);
    const after = writer.files.get(path) ?? '';
    const changed = after.split('\n').filter((line, index) => line !== before.split('\n')[index]);
    expect(changed).toEqual(['- Answer: Only the catalog manager.']);
    expect(after.split('\n').length).toBe(before.split('\n').length);
    expect(outcome.ok && outcome.value.map((each) => each.answer)).toEqual([
      '',
      'Only the catalog manager.',
    ]);
  });
});

describe('answers.md keeps what it holds', () => {
  it('RF-1007 keeps the answers of other questions and runs when one is recorded', async () => {
    const { answers } = await setup();
    await answers.recordAnswers(project, second, [{ cardId: 'OQ-001', answer: 'Never.' }]);
    await answers.recordAnswers(project, first, [{ cardId: 'OQ-001', answer: 'Yes, greyed.' }]);

    await answers.recordAnswers(project, first, [{ cardId: 'OQ-002', answer: 'Managers.' }]);

    expect((await answers.questionsOf(project, first)).map((each) => each.answer)).toEqual([
      'Yes, greyed.',
      'Managers.',
    ]);
    expect((await answers.questionsOf(project, second)).map((each) => each.answer)).toEqual([
      'Never.',
    ]);
  });

  it('RF-1007 replaces an earlier answer and clears it when the new one is empty', async () => {
    const { answers } = await setup();
    await answers.recordAnswers(project, first, [{ cardId: 'OQ-001', answer: 'Yes.' }]);

    await answers.recordAnswers(project, first, [{ cardId: 'OQ-001', answer: 'No, hidden.' }]);
    const replaced = await answers.questionsOf(project, first);
    await answers.recordAnswers(project, first, [{ cardId: 'OQ-001', answer: '   ' }]);

    expect(replaced[0]?.answer).toBe('No, hidden.');
    expect((await answers.questionsOf(project, first))[0]?.answer).toBe('');
  });
});

describe('answers.md refusals and repairs', () => {
  it('RF-1007 writes an answer on one line, masked, so it cannot start a section', async () => {
    const { writer, answers } = await setup();
    const token = ['ghp', '_', 'a'.repeat(36)].join('');

    await answers.recordAnswers(project, first, [
      { cardId: 'OQ-001', answer: `Yes.\n\n## OQ-009 - Fake\n- Answer: ${token}` },
    ]);

    const text = writer.files.get(path) ?? '';
    expect(text).not.toContain(token);
    expect(text).not.toContain('\n## OQ-009');
    expect((await answers.questionsOf(project, first)).length).toBe(2);
    expect((await answers.questionsOf(project, first))[0]?.answer).toMatch(/^Yes\. ## OQ-009/u);
  });
});

describe('answers.md and unknown questions', () => {
  it('RF-1007 refuses a card id the run has no question for and writes nothing', async () => {
    const { writer, answers } = await setup();
    const before = writer.files.get(path);
    const writes = writer.writes.length;

    const outcome = await answers.recordAnswers(project, second, [
      { cardId: 'OQ-001', answer: 'Never.' },
      { cardId: 'OQ-002', answer: 'Not a question of this run.' },
    ]);

    expect(outcome).toEqual({ ok: false, error: 'unknown-question' });
    expect(writer.files.get(path)).toBe(before);
    expect(writer.writes.length).toBe(writes);
  });

  it('RF-1007 answers no questions for a project without answers.md', async () => {
    const answers = new FileAnswersFile({
      writer: new MemoryOutputWriter(),
      masker: new SecretMasker(),
    });

    expect(await answers.questionsOf(project, first)).toEqual([]);
    expect(await answers.recordAnswers(project, first, [])).toEqual({ ok: true, value: [] });
  });

  it('RF-1007 adds an answer line to a section that lost it', async () => {
    const writer = new MemoryOutputWriter();
    writer.files.set(
      path,
      [
        '# Answers to open questions',
        '',
        `## OQ-001 - Is a sold-out item shown?`,
        '',
        `- Card: runs/${first}/cards/OQ/OQ-001.md`,
        '- Context: Catalog/Default.aspx.cs:1-4 stock',
        '',
      ].join('\n'),
    );
    const answers = new FileAnswersFile({ writer, masker: new SecretMasker() });

    await answers.recordAnswers(project, first, [{ cardId: 'OQ-001', answer: 'Yes.' }]);

    expect(writer.files.get(path)).toContain(
      '- Context: Catalog/Default.aspx.cs:1-4 stock\n- Answer: Yes.\n',
    );
  });
});
