import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseUxAnswer } from '../../../../src/application/plan/ux-answer.js';

// RF-626, ADR-013: the planner's screens are untrusted text, read as one JSON object (fenced or in
// prose) with every list and text bounded. Which cards are allowed is the domain's decision, not
// this parser's.

const screen = {
  name: 'Orders',
  purpose: 'Lists them.',
  reason: 'Same data.',
  cards: ['SCRN-001', 'SCRN-002'],
};

describe('parseUxAnswer', () => {
  it('RF-626 reads a fenced JSON object and fills what the answer leaves out', () => {
    const body = { screens: [{ name: 'A', cards: ['SCRN-001'] }] };
    const answer = '```json\n' + JSON.stringify(body) + '\n```';

    expect(parseUxAnswer(answer)).toEqual({
      screens: [{ name: 'A', purpose: '', reason: '', cards: ['SCRN-001'] }],
      dropped: [],
      designBrief: { audience: '', tone: '', components: [] },
    });
  });

  it('RF-626 reads the object inside prose and keeps the screens, dropped cards and brief', () => {
    const body = {
      screens: [screen],
      dropped: [{ card: 'SCRN-004', reason: 'Fax.' }],
      designBrief: { audience: 'Shoppers.', tone: 'Calm.', components: ['Table', 'Dialog'] },
    };

    const draft = parseUxAnswer(`Here you go: ${JSON.stringify(body)} Done.`);

    expect(draft).toEqual(body);
  });
});

describe('parseUxAnswer: partial answers and refusals', () => {
  it('RF-626 an answer that only drops screens is an answer', () => {
    const draft = parseUxAnswer(JSON.stringify({ dropped: [{ card: 'SCRN-004', reason: 'x' }] }));

    expect(draft?.screens).toEqual([]);
    expect(draft?.dropped).toHaveLength(1);
  });

  it.each([
    ['text that is not JSON', 'No screens today.'],
    ['an object without screens or dropped', '{"pages": []}'],
    ['empty lists', '{"screens": [], "dropped": []}'],
    ['a screen without cards', JSON.stringify({ screens: [{ name: 'A' }] })],
    ['a screen with no card in it', JSON.stringify({ screens: [{ name: 'A', cards: [] }] })],
    [
      'a name of 201 characters',
      JSON.stringify({ screens: [{ ...screen, name: 'n'.repeat(201) }] }),
    ],
    [
      'a reason of 2001 characters',
      JSON.stringify({ screens: [{ ...screen, reason: 'r'.repeat(2001) }] }),
    ],
    [
      'a card id of 41 characters',
      JSON.stringify({ screens: [{ ...screen, cards: ['S'.repeat(41)] }] }),
    ],
    ['201 screens', JSON.stringify({ screens: Array.from({ length: 201 }, () => screen) })],
    ['a dropped card without a card id', JSON.stringify({ dropped: [{ reason: 'x' }] })],
    [
      '51 components',
      JSON.stringify({ screens: [screen], designBrief: { components: Array(51).fill('c') } }),
    ],
    [
      'an audience of 2001 characters',
      JSON.stringify({ screens: [screen], designBrief: { audience: 'a'.repeat(2001) } }),
    ],
  ])('RF-626 refuses %s', (_name, answer) => {
    expect(parseUxAnswer(answer)).toBeUndefined();
  });
});

describe('parseUxAnswer: which object and the shipped prompt', () => {
  it('RF-626 takes the first object of the answer that reads as screens', () => {
    const answer = `{"screens": 3} ${JSON.stringify({ screens: [screen] })}`;

    expect(parseUxAnswer(answer)?.screens).toHaveLength(1);
  });

  it('RF-626 the example in the shipped prompt is a readable answer', async () => {
    const prompt = await readFile('prompts/planner/ux.v1.md', 'utf8');

    const draft = parseUxAnswer(prompt.slice(prompt.indexOf('## Answer')));

    expect(draft?.screens.map((each) => each.name)).toEqual(['Orders', 'Checkout']);
    expect(draft?.dropped.map((each) => each.card)).toEqual(['SCRN-004']);
    expect(draft?.designBrief.components).toHaveLength(3);
  });
});
