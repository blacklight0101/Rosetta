import { describe, expect, it } from 'vitest';
import { parseGapAnswer } from '../../../../src/application/plan/gap-answer.js';
import { scenario } from '../../../support/task-card-fixtures.js';

// RF-627, RF-630, ADR-013, Q-45: the planner's task cards for the gaps are untrusted text, read as
// one JSON object (fenced or in prose) with every list and text bounded. Which gaps a card builds,
// and whether it is a card, is the domain's decision (plan-gap.ts).

const card = {
  title: 'Refund an order',
  phase: 1,
  requirements: [1],
  acceptanceCriteria: [scenario],
  invariant: 'A refund never exceeds the amount paid.',
  riskClass: 'money',
  adds: ['limit'],
  probes: ['A refund of exactly the amount paid.'],
  files: ['src/refunds/'],
  dependsOn: [],
  builds: ['flow:FLOW-007'],
};

describe('parseGapAnswer', () => {
  it('RF-627 reads a fenced JSON object into task drafts', () => {
    const answer = '```json\n' + JSON.stringify({ tasks: [card] }) + '\n```';

    expect(parseGapAnswer(answer)).toEqual([card]);
  });

  it('RF-627 reads the object inside prose', () => {
    const answer = `Here: ${JSON.stringify({ tasks: [card, card] })} Done.`;

    expect(parseGapAnswer(answer)).toHaveLength(2);
  });

  it('RF-627 an answer with no card is still an answer', () => {
    expect(parseGapAnswer('{"tasks": []}')).toEqual([]);
  });

  it('RF-630 a list the answer leaves out is empty, and a risk class that does not exist is left out', () => {
    const bare = { title: 'T', phase: 1, acceptanceCriteria: [scenario], builds: ['flow:X'] };
    const odd = { ...bare, riskClass: 'catastrophe' };

    const [first, second] = parseGapAnswer(JSON.stringify({ tasks: [bare, odd] })) ?? [];

    expect(first).toMatchObject({
      requirements: [],
      adds: [],
      probes: [],
      files: [],
      dependsOn: [],
    });
    expect(first?.invariant).toBe('');
    expect(first?.riskClass).toBeUndefined();
    expect(second?.riskClass).toBeUndefined();
  });

  it('RF-627 a card that cannot be read is left out and the others stay', () => {
    const broken = { ...card, phase: 0 };
    const noBuilds = { title: 'T', phase: 1, acceptanceCriteria: [scenario] };

    const drafts = parseGapAnswer(JSON.stringify({ tasks: [broken, card, noBuilds, 'text'] }));

    expect(drafts).toEqual([card]);
  });
});

describe('parseGapAnswer: refusals', () => {
  it.each([
    ['text that is not JSON', 'Everything is built.'],
    ['an object without tasks', '{"links": []}'],
    ['tasks that are not a list', '{"tasks": "none"}'],
    ['more than 50 cards', JSON.stringify({ tasks: Array.from({ length: 51 }, () => card) })],
  ])('RF-627 %s is no answer', (_name, text) => {
    expect(parseGapAnswer(text)).toBeUndefined();
  });

  it('RF-627 a list of builds over 500 ids or an id of 301 characters makes that card unreadable', () => {
    const many = { ...card, builds: Array.from({ length: 501 }, () => 'flow:X') };
    const long = { ...card, builds: ['t'.repeat(301)] };

    expect(parseGapAnswer(JSON.stringify({ tasks: [many, long, card] }))).toEqual([card]);
  });

  it('RF-627 only the text before the output limit is read', () => {
    const late = ' '.repeat(2_000_000) + JSON.stringify({ tasks: [card] });

    expect(parseGapAnswer(late)).toBeUndefined();
  });
});
