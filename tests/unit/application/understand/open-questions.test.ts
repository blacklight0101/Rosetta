import { describe, expect, it } from 'vitest';
import { assignCardIds, type CardDraft } from '../../../../src/domain/cards/card-ids.js';
import { openQuestionsOf } from '../../../../src/application/understand/open-questions.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-243, DEC-136: the open questions of a run. Duplicates across areas are merged keeping every
// citation; the questions are grouped by the area they concern and ordered by how much of the
// specification depends on them (the cards that cite a file the question cites).

function cite(path: string, startLine: number, endLine: number) {
  return { path, startLine, endLine };
}

function card(type: CardDraft['type'], title: string, path: string, lines: [number, number]) {
  const claims = [{ text: `${title} claim.`, citations: [cite(path, ...lines)] }];
  return draftOf({ type, title, claims });
}

function question(text: string, path: string, lines: [number, number]): CardDraft {
  return draftOf({
    type: 'OQ',
    title: text,
    question: text,
    whyItMatters: 'It decides the specification.',
    claims: [{ text: `Code behind ${text}`, citations: [cite(path, ...lines)] }],
  });
}

const checkout = 'src/Orders/Checkout.cs';
const search = 'src/Catalog/Search.cs';
const tax = 'src/Billing/Tax.cs';

function cardsOfRun() {
  const built = assignCardIds([
    {
      agentTaskId: 'task-1',
      area: 'orders',
      drafts: [
        card('FEAT', 'Checkout', checkout, [10, 24]),
        question('Which roles may print the invoice?', checkout, [1, 5]),
        question('Who uses these pages?', checkout, [1, 5]),
      ],
    },
    {
      agentTaskId: 'task-2',
      area: 'catalog',
      drafts: [
        card('BR', 'Hidden products', search, [1, 9]),
        card('FEAT', 'Product search', search, [20, 30]),
        question('who uses these pages', search, [2, 3]),
        question('How many products are listed?', search, [2, 3]),
      ],
    },
    {
      agentTaskId: 'task-3',
      area: 'billing',
      drafts: [
        ...['A', 'B', 'C', 'D', 'E'].map((name) => card('BR', `Tax ${name}`, tax, [1, 20])),
        question('Which tax rate applies?', tax, [1, 4]),
      ],
    },
  ]);
  if (!built.ok) throw new Error('the test cards are invalid');
  return built.value;
}

describe('RF-243 the open questions of a run', () => {
  it('RF-243 merges the same question from several areas into one, keeping every citation', () => {
    const questions = openQuestionsOf(cardsOfRun(), 'run-1');

    const merged = questions.filter((each) => each.question === 'Who uses these pages?');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.cardId).toBe('OQ-002');
    expect(merged[0]?.context.startsWith(`${checkout}:1-5 `)).toBe(true);
    expect(merged[0]?.context).toContain(`${search}:2-3`);
  });

  it('RF-243 a question asked once keeps the context it always had: first citation and first claim', () => {
    const questions = openQuestionsOf(cardsOfRun(), 'run-1');

    const single = questions.find((each) => each.question === 'Which tax rate applies?');
    expect(single?.context).toBe(`${tax}:1-4 Code behind Which tax rate applies?`);
    expect(single?.runKey).toBe('run-1');
  });

  it('RF-243 groups the questions by area, the area with most dependants first, and the most depended-on first inside it', () => {
    const questions = openQuestionsOf(cardsOfRun(), 'run-1');

    expect(questions.map((each) => each.question)).toEqual([
      'Which tax rate applies?',
      'Who uses these pages?',
      'Which roles may print the invoice?',
      'How many products are listed?',
    ]);
  });
});

describe('RF-243 equal questions of one area (Q-52)', () => {
  it('RF-243 two equal open questions of one area are one question keeping both citations', () => {
    const built = assignCardIds([
      {
        agentTaskId: 'reader-001',
        area: 'invoice',
        drafts: [question('Who approves an invoice?', checkout, [1, 5])],
      },
      {
        agentTaskId: 'reader-002',
        area: 'invoice',
        drafts: [question('Who approves an invoice', search, [2, 3])],
      },
    ]);
    if (!built.ok) throw new Error('the test cards are invalid');

    const questions = openQuestionsOf(built.value, 'run-1');

    expect(questions).toHaveLength(1);
    expect(questions[0]?.cardId).toBe('OQ-001');
    expect(questions[0]?.context).toContain(`${search}:2-3`);
  });
});

describe('RF-243 what depends on a question', () => {
  it('RF-243 questions do not depend on each other: an open question never counts as a dependant', () => {
    const cards = assignCardIds([
      {
        agentTaskId: 'task-1',
        area: 'orders',
        drafts: [
          question('First?', search, [1, 5]),
          question('Second?', checkout, [1, 5]),
          card('FEAT', 'Checkout', checkout, [10, 24]),
        ],
      },
      {
        agentTaskId: 'task-2',
        area: 'catalog',
        drafts: [question('Third?', search, [1, 5])],
      },
    ]);
    if (!cards.ok) throw new Error('the test cards are invalid');

    const questions = openQuestionsOf(cards.value, 'run-1');

    expect(questions.map((each) => each.question)).toEqual(['Second?', 'First?', 'Third?']);
  });

  it('RF-243 two questions with the same wording but nothing but punctuation are not merged', () => {
    const cards = assignCardIds([
      {
        agentTaskId: 'task-1',
        area: 'orders',
        drafts: [question('?', checkout, [1, 5]), question('...', checkout, [6, 9])],
      },
    ]);
    if (!cards.ok) throw new Error('the test cards are invalid');

    expect(openQuestionsOf(cards.value, 'run-1')).toHaveLength(2);
  });
});

describe('RF-240 a run without questions', () => {
  it('RF-240 a run without open questions gives none', () => {
    const cards = assignCardIds([
      {
        agentTaskId: 'task-1',
        area: 'orders',
        drafts: [card('FEAT', 'Checkout', checkout, [1, 5])],
      },
    ]);
    if (!cards.ok) throw new Error('the test cards are invalid');

    expect(openQuestionsOf(cards.value, 'run-1')).toEqual([]);
  });
});
