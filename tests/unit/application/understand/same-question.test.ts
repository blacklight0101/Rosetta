import { describe, expect, it } from 'vitest';
import { mergedIntoAnswered } from '../../../../src/application/deepen/deepen-answers.js';
import {
  withAnswersOf,
  askingTheSame,
} from '../../../../src/application/understand/answer-rerun.js';
import { sameQuestion } from '../../../../src/application/understand/open-questions.js';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import type { PriorCard } from '../../../../src/application/ports/prior-cards.js';
import type { Card } from '../../../../src/domain/cards/card.js';

// RF-646, RF-243, RF-209, Q-52, DEC-179, EV-57: one rule for "asks the same".

const invoiceAnswered = 'What is the business process flow for invoice approval?';
const invoiceAgain = 'What is the specific business process flow for invoice approval?';
const eshopAnswered = 'Where is the database connection string stored?';
const eshopAgain = 'Where is the specific database connection string stored in the application?';

describe('RF-646 sameQuestion', () => {
  it('EV-57 Invoice: two extra words in the same area are the same question', () => {
    expect(sameQuestion(invoiceAnswered, invoiceAgain)).toBe(true);
  });
  it('EV-57 eShop: other words in another area are the same question', () => {
    expect(sameQuestion(eshopAnswered, eshopAgain)).toBe(true);
  });
  it('Q-52 case and marks still do not matter', () => {
    expect(sameQuestion('Who uses these pages?', 'who uses these pages')).toBe(true);
  });
  it('a question that only shares a few words stays apart', () => {
    expect(sameQuestion('Who uses these pages?', 'Who approves invoices?')).toBe(false);
    expect(sameQuestion(invoiceAnswered, 'Where is the invoice stored?')).toBe(false);
    expect(sameQuestion(eshopAnswered, 'How is the connection string rotated?')).toBe(false);
    expect(sameQuestion('', '')).toBe(false);
  });
});

function oq(id: string, area: string, question: string): Card {
  return { id, area, type: 'OQ', title: question, question, claims: [] } as unknown as Card;
}

function prior(id: string, area: string, question: string): PriorCard {
  return { id, area, type: 'OQ', title: question, question, claims: [] };
}

describe('RF-646 call sites', () => {
  it('EV-57 mergedIntoAnswered merges both pairs into the answered question', () => {
    const fresh = [
      oq('OQ-003', 'Billing', invoiceAgain),
      oq('OQ-024', 'Data', eshopAgain),
      oq('OQ-030', 'Data', 'Who owns the nightly export job?'),
    ];
    const merged = mergedIntoAnswered(fresh, [
      { question: invoiceAnswered },
      { question: eshopAnswered },
    ]);
    expect(merged.map((c) => c.id)).toEqual(['OQ-003', 'OQ-024']);
  });
  it('askingTheSame groups the near question with the answered one', () => {
    const a = prior('OQ-002', 'Billing', invoiceAnswered);
    const b = prior('OQ-003', 'Billing', invoiceAgain);
    const c = prior('OQ-004', 'Billing', 'Who owns the nightly export job?');
    expect(askingTheSame(b, [a, b, c]).map((x) => x.id)).toEqual(['OQ-002', 'OQ-003']);
  });
});

describe('RF-209 the Deepen reader gets the answers of the whole project', () => {
  const area = (name: string) => ({ name, files: [], estimatedTokens: 1 });
  const tasks = [{ agentTaskId: 'reader-001', area: area('Catalog') }] as unknown as ReaderTask[];
  const plan = {
    project: { userId: 'u', projectId: 'p' },
    skipped: [],
    baseline: [],
    pending: [
      {
        cardId: 'OQ-013',
        runKey: 'r',
        area: 'Data',
        question: eshopAnswered,
        answer: 'In web.config',
        context: '',
        used: true,
      },
    ],
  };
  it('an area with no answer of its own still hears the answers of other areas', () => {
    expect(withAnswersOf(tasks, plan)[0]?.answers).toBeUndefined();
    expect(withAnswersOf(tasks, plan, true)[0]?.answers).toContain('In web.config');
  });
});
