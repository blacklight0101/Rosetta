import { describe, expect, it } from 'vitest';
import { parseGapAnswer } from '../../../../src/application/plan/gap-answer.js';
import { scenario } from '../../../support/task-card-fixtures.js';

// RF-627, RF-630, ADR-013, Q-45, Q-54: the planner's task cards for the gaps are untrusted text, read
// as one JSON object (fenced or in prose) with every list and text bounded. Which gaps a card
// builds, and whether it is a card, is the domain's decision (plan-gap.ts). A card that cannot be
// read is left out with its position and the field that was wrong, never with answer text.

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

const read = (value: unknown) => parseGapAnswer(JSON.stringify(value));

describe('parseGapAnswer', () => {
  it('RF-627 reads a fenced JSON object into task drafts', () => {
    const answer = '```json\n' + JSON.stringify({ tasks: [card] }) + '\n```';

    expect(parseGapAnswer(answer)?.drafts).toEqual([card]);
  });

  it('RF-627 reads the object inside prose', () => {
    const answer = `Here: ${JSON.stringify({ tasks: [card, card] })} Done.`;

    expect(parseGapAnswer(answer)?.drafts).toHaveLength(2);
  });

  it('RF-627 an answer with no card is still an answer', () => {
    expect(parseGapAnswer('{"tasks": []}')).toEqual({
      drafts: [],
      positions: [],
      problems: [],
      entries: [],
      mapped: [],
    });
  });

  it('RF-630 a list the answer leaves out is empty, and a risk class that does not exist is left out', () => {
    const bare = { title: 'T', phase: 1, acceptanceCriteria: [scenario], builds: ['flow:X'] };
    const odd = { ...bare, riskClass: 'catastrophe' };

    const [first, second] = read({ tasks: [bare, odd] })?.drafts ?? [];

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

    const answer = read({ tasks: [broken, card, noBuilds, 'text'] });

    expect(answer?.drafts).toEqual([card]);
  });
});

describe('parseGapAnswer: positions written as objects (Q-54)', () => {
  const objects = {
    ...card,
    requirements: [{ position: 3 }, { position: 1 }],
    dependsOn: [{ position: 4, builds: ['T-004'] }],
  };

  it('RF-627 Q-54 reads an object with a numeric position as that number', () => {
    const answer = read({ tasks: [objects] });

    expect(answer?.drafts).toEqual([{ ...card, requirements: [3, 1], dependsOn: [4] }]);
    expect(answer?.problems).toEqual([]);
  });

  it('RF-627 Q-54 reads numbers and objects mixed in one list', () => {
    const mixed = { ...card, requirements: [2, { position: 3 }] };

    expect(read({ tasks: [mixed] })?.drafts[0]?.requirements).toEqual([2, 3]);
  });

  it.each([
    ['a position written as a string', { position: '3' }],
    ['an object with an id and no position', { id: 3 }],
    ['an object whose position is a list', { position: [3] }],
    ['a position of 0', { position: 0 }],
    ['a position of 201', { position: 201 }],
    ['a fractional position', { position: 1.5 }],
    ['null', null],
    ['a text that is no card id', 'the login card'],
  ])('RF-627 P7-15 %s in requirements is dropped, counted and the card kept', (_name, bad) => {
    const answer = read({ tasks: [card, { ...card, requirements: [bad] }] });

    expect(answer?.drafts).toEqual([card, { ...card, requirements: [] }]);
    expect(answer?.problems).toEqual([]);
    expect(answer?.entries).toEqual([{ position: 2, field: 'requirements', count: 1 }]);
  });

  it('RF-627 P7-15 a string of digits in requirements is its position', () => {
    const answer = read({ tasks: [{ ...card, requirements: ['3'] }] });

    expect(answer?.drafts[0]?.requirements).toEqual([3]);
    expect(answer?.entries).toEqual([]);
  });
});

describe('parseGapAnswer: what a card that is left out reports (Q-54)', () => {
  it('RF-627 P5-40 reads the id of a card already written in dependsOn', () => {
    const answer = read({ tasks: [{ ...card, dependsOn: ['T-001', 2, 'T-012'] }] });

    expect(answer?.drafts[0]?.dependsOn).toEqual(['T-001', 2, 'T-012']);
  });

  it.each([
    ['a text that is no card id', 'the login card'],
    ['an object with an id and no position', { id: 1 }],
  ])('RF-627 P7-14 %s in dependsOn is dropped and the card kept', (_name, entry) => {
    const answer = read({ tasks: [{ ...card, dependsOn: [entry, 'T-001'] }] });

    expect(answer?.drafts[0]?.dependsOn).toEqual(['T-001']);
    expect(answer?.problems).toEqual([]);
    expect(answer?.entries).toEqual([{ position: 1, field: 'dependsOn', count: 1 }]);
  });

  it('RF-627 Q-54 names the card when the card is not an object, and keeps no ids from it', () => {
    const answer = read({ tasks: ['text', 7, null, card] });

    expect(answer?.problems).toMatchObject([
      { position: 1, field: 'card', builds: [] },
      { position: 2, field: 'card', builds: [] },
      { position: 3, field: 'card', builds: [] },
    ]);
  });

  it('RF-627 Q-54 the problem holds a reason and no text of the answer', () => {
    const sentinel = 'sentinel-title-' + 'x'.repeat(8);
    const answer = read({
      tasks: [{ ...card, title: sentinel, phase: { id: sentinel } }],
    });

    expect(JSON.stringify(answer?.problems)).not.toContain(sentinel);
    expect(answer?.problems[0]?.reason).toMatch(/wrong type or shape/u);
  });
});

describe('parseGapAnswer: the ids and fields of a card that is left out (Q-54)', () => {
  it('RF-627 Q-54 the builds of a left-out card are only the ids that are texts, bounded', () => {
    const odd = {
      ...card,
      requirements: ['3'],
      builds: ['flow:FLOW-007', 4, null, 't'.repeat(301)],
    };

    expect(read({ tasks: [odd] })?.problems[0]?.builds).toEqual(['flow:FLOW-007']);
  });

  it('RF-627 Q-54 the ids of a left-out card are cut to the 500 a card may name', () => {
    const many = Array.from({ length: 600 }, (_, at) => `flow:F${String(at)}`);
    const odd = { ...card, requirements: ['3'], builds: many };

    expect(read({ tasks: [odd] })?.problems[0]?.builds).toEqual(many.slice(0, 500));
  });

  it('RF-627 Q-54 a card whose builds list is no list names no id', () => {
    const odd = { ...card, requirements: ['3'], builds: 'flow:FLOW-007' };

    expect(read({ tasks: [odd] })?.problems[0]?.builds).toEqual([]);
  });

  it('RF-630 Q-54 a kind of guard that does not exist is reported as a value that is not valid', () => {
    const answer = read({ tasks: [{ ...card, adds: ['regex'] }] });

    expect(answer?.problems.map((each) => [each.position, each.field, each.reason])).toEqual([
      [1, 'adds', 'is not valid'],
    ]);
  });

  it('RF-627 Q-54 names a field that is too long or too short for the reason', () => {
    const long = { ...card, title: 't'.repeat(201) };
    const none = { ...card, acceptanceCriteria: [] };

    const problems = read({ tasks: [long, none] })?.problems ?? [];

    expect(problems.map((each) => [each.position, each.field])).toEqual([
      [1, 'title'],
      [2, 'acceptanceCriteria'],
    ]);
    expect(problems.map((each) => each.reason)).toEqual([
      expect.stringMatching(/above its maximum/u),
      expect.stringMatching(/empty or below its minimum/u),
    ]);
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

    const answer = read({ tasks: [many, long, card] });

    expect(answer?.drafts).toEqual([card]);
    expect(answer?.problems.map((each) => [each.position, each.field])).toEqual([
      [1, 'builds'],
      [2, 'builds'],
    ]);
  });

  it('RF-627 only the text before the output limit is read', () => {
    const late = ' '.repeat(2_000_000) + JSON.stringify({ tasks: [card] });

    expect(parseGapAnswer(late)).toBeUndefined();
  });
});
