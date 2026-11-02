import { describe, expect, it } from 'vitest';
import { openQuestionsOf } from '../../../../src/application/understand/open-questions.js';
import { assignCardIds, type CardDraft } from '../../../../src/domain/cards/card-ids.js';
import { FileAnswersFile } from '../../../../src/infrastructure/cards/answers-file.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-243, RF-646, EV-89, P8-08: a run's list is grouped by area and capped at 20 questions; the rest
// follow a "More questions" heading, still in the file and still answerable.

const project = {
  userId: '00000000-0000-4000-9000-0000000000a1',
  projectId: '00000000-0000-4000-a000-0000000000c1',
};
const path = `projects/${project.projectId}/answers.md`;
const subjects = [
  ...['tax', 'refund', 'stock', 'carrier', 'coupon', 'rounding', 'invoice', 'ledger'],
  ...['payroll', 'catalog', 'warehouse', 'currency', 'discount', 'audit', 'archive'],
];

function drafts(area: string, count: number): CardDraft[] {
  return subjects.slice(0, count).map((subject, index) => {
    const text = `Which ${subject}${String(index)} limit applies in ${area}?`;
    const file = `${area}/f${String(index)}.cs`;
    return draftOf({
      type: 'OQ',
      area,
      title: text,
      question: text,
      whyItMatters: 'It decides.',
      claims: [{ text: 'c', citations: [{ path: file, startLine: 1, endLine: 4 }] }],
    });
  });
}

function cardsOfTwoAreas() {
  const built = assignCardIds([
    { agentTaskId: 't1', area: 'billing', drafts: drafts('billing', 15) },
    { agentTaskId: 't2', area: 'orders', drafts: drafts('orders', 15) },
  ]);
  if (!built.ok) throw new Error('the test cards are invalid');
  return built.value;
}

function setup() {
  const writer = new MemoryOutputWriter();
  return { writer, answers: new FileAnswersFile({ writer, masker: new SecretMasker() }) };
}

describe('P8-08 the list of a run is capped', () => {
  it('EV-89 writes the first 20 questions, then More questions, then the rest', async () => {
    const { writer, answers } = setup();

    await answers.addQuestions(project, openQuestionsOf(cardsOfTwoAreas(), 'run-1'));

    const text = writer.files.get(path) ?? '';
    const heading = text.indexOf('## More questions');
    expect(heading).toBeGreaterThan(0);
    expect(text.slice(0, heading).match(/^## OQ-/gmu)).toHaveLength(20);
    expect(text.slice(heading).match(/^## OQ-/gmu)).toHaveLength(10);
    expect(text.match(/^## More questions/gmu)).toHaveLength(1);
    expect(await answers.questionsOf(project, 'run-1')).toHaveLength(30);
  });

  it('EV-89 keeps the questions of one area together', () => {
    const areas = openQuestionsOf(cardsOfTwoAreas(), 'run-1').map(
      (each) => each.question.split(' in ')[1],
    );

    expect(areas.slice(0, 15).every((each) => each === areas[0])).toBe(true);
  });

  it('EV-89 does not cap a list of 20 or fewer', async () => {
    const built = assignCardIds([
      { agentTaskId: 't1', area: 'billing', drafts: drafts('billing', 15) },
    ]);
    if (!built.ok) throw new Error('the test cards are invalid');
    const { writer, answers } = setup();

    await answers.addQuestions(project, openQuestionsOf(built.value, 'run-1'));

    expect(writer.files.get(path)).not.toContain('More questions');
  });

  it('EV-89 saves an answer under the heading to the right question', async () => {
    const { writer, answers } = setup();
    await answers.addQuestions(project, openQuestionsOf(cardsOfTwoAreas(), 'run-1'));

    const recorded = await answers.recordAnswers(project, 'run-1', [
      { cardId: 'OQ-030', answer: 'Fifty.' },
    ]);

    expect(recorded.ok).toBe(true);
    const text = writer.files.get(path) ?? '';
    expect(text).toMatch(/## OQ-030 - [^\n]*\n(?:[^\n]*\n)*- Answer: Fifty\./u);
    expect(text.match(/^## More questions\s*$/gmu)).toHaveLength(1);
  });
});
