import { describe, expect, it } from 'vitest';
import { parseGapAnswer } from '../../../../src/application/plan/gap-answer.js';
import { scenario } from '../../../support/task-card-fixtures.js';

// P7-14, RF-627, ADR-013: one bad element of a gap card no longer drops the whole card. A
// `dependsOn` entry is read on its own: a string of digits is that position (as the package answer
// reads it), an entry that is neither a position nor a `T-` id is dropped and counted, and the card
// stays. An answer that is not JSON as a whole (Ollama eShop plan a9700a80 wrote
// `"requirements": [ none ]`) still gives the task objects that are JSON.

const card = {
  title: 'Refund an order',
  phase: 1,
  requirements: [1],
  acceptanceCriteria: [scenario],
  invariant: 'A refund never exceeds the amount paid.',
  riskClass: 'none',
  adds: [],
  probes: [],
  files: ['src/refunds/'],
  dependsOn: [],
  builds: ['flow:FLOW-007'],
};

const read = (value: unknown) => parseGapAnswer(JSON.stringify(value));

describe('parseGapAnswer: dependsOn read entry by entry (P7-14)', () => {
  it('RF-627 P7-14 reads dependsOn ["1"] as position 1', () => {
    const answer = read({ tasks: [card, { ...card, dependsOn: ['1'] }] });

    expect(answer?.drafts[1]?.dependsOn).toEqual([1]);
    expect(answer?.problems).toEqual([]);
    expect(answer?.entries).toEqual([]);
  });

  it('RF-627 P7-14 dependsOn ["operation:x"] drops the entry and keeps the card', () => {
    const answer = read({
      tasks: [card, { ...card, dependsOn: ['operation:x', 'T-001', 1, { id: 2 }] }],
    });

    expect(answer?.drafts).toHaveLength(2);
    expect(answer?.drafts[1]?.dependsOn).toEqual(['T-001', 1]);
    expect(answer?.positions).toEqual([1, 2]);
    expect(answer?.problems).toEqual([]);
    expect(answer?.entries).toEqual([{ position: 2, field: 'dependsOn', count: 2 }]);
  });

  it('RF-627 P7-14 a dependsOn that is not a list still leaves the card out', () => {
    const answer = read({ tasks: [{ ...card, dependsOn: 'T-001' }] });

    expect(answer?.problems).toMatchObject([{ position: 1, field: 'dependsOn' }]);
  });
});

describe('parseGapAnswer: an answer that is not JSON as a whole (P7-14)', () => {
  const broken = JSON.stringify({
    ...card,
    title: 'Informational pages',
    builds: ['screen:SCRN-003'],
  }).replace('"requirements":[1]', '"requirements": [\n        none\n      ]');
  const second = { ...card, title: 'Load the view', dependsOn: ['2'], builds: ['flow:FLOW-005'] };
  const text = [
    '```json',
    '{\n  "tasks": [',
    `    ${JSON.stringify(card)},`,
    `    ${broken},`,
    `    ${JSON.stringify(second)}`,
    '  ]\n}',
    '```',
  ].join('\n');

  it('RF-627 P7-14 an answer with one card holding [ none ] still reads the other cards', () => {
    const answer = parseGapAnswer(text);

    expect(answer?.drafts.map((each) => each.title)).toEqual(['Refund an order', 'Load the view']);
    expect(answer?.positions).toEqual([1, 3]);
    expect(answer?.drafts[1]?.dependsOn).toEqual([2]);
    expect(answer?.salvaged).toBe(true);
  });

  it('RF-627 P7-14 the card that is not JSON is a problem of the card, with the ids it named', () => {
    const answer = parseGapAnswer(text);

    expect(answer?.problems).toEqual([
      { position: 2, field: 'card', reason: 'is not valid JSON', builds: ['screen:SCRN-003'] },
    ]);
    expect(JSON.stringify(answer?.problems)).not.toContain('Informational');
  });
});

describe('parseGapAnswer: the bounds of reading card by card (P7-14)', () => {
  it('RF-627 P7-14 an answer read whole is not marked salvaged', () => {
    expect(read({ tasks: [card] })?.salvaged).toBeUndefined();
  });

  it.each([
    ['prose with no task list', 'Everything is built: tasks none.'],
    ['a task list that is not a list', '{"tasks": none}'],
    ['more than 50 elements', `{"tasks": [${Array.from({ length: 51 }, () => '{x}').join(',')}]}`],
  ])('RF-627 P7-14 %s is still no answer', (_name, answerText) => {
    expect(parseGapAnswer(answerText)).toBeUndefined();
  });

  it('RF-627 P7-14 a list cut off inside a card keeps the cards before it', () => {
    const cut = `{"tasks": [${JSON.stringify(card)}, {"title": "Cut`;

    const answer = parseGapAnswer(cut);

    expect(answer?.drafts).toHaveLength(1);
    expect(answer?.problems).toEqual([]);
  });

  it('RF-627 P7-14 ADR-013 a salvaged card drops __proto__ like any answer', () => {
    const hostile = `{"tasks": [{"__proto__": {"polluted": true}, ${JSON.stringify(card).slice(1)}, {"x": [ none ]}]}`;

    const answer = parseGapAnswer(hostile);

    expect(answer?.drafts).toHaveLength(1);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
