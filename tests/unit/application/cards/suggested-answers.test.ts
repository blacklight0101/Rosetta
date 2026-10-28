import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseCardsLenient } from '../../../../src/application/cards/parse-cards.js';
import { renderRepairRequest } from '../../../../src/application/cards/repair-request.js';
import { cardObject } from '../../../support/card-output.js';

// RF-645, RF-243, DEC-178: an OQ card written in the v3 format carries three suggested answers, one
// recommended and listed first, each with a description and, when the code supports it, a citation.
// A card without them is refused with a repair message; a card of the earlier format parses without.

const required = { suggestedAnswers: 'required' } as const;

function answer(label: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { answer: label, description: `What ${label} means and what follows.`, ...overrides };
}

const threeAnswers = [
  answer('Set by the owner', { recommended: true, citations: ['src/Orders/Shipping.cs:12-30'] }),
  answer('A legacy default'),
  answer('Yes, but only for domestic orders'),
];

function question(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return cardObject({
    type: 'OQ',
    title: 'Free shipping threshold',
    question: 'Why is the free-shipping threshold 50?',
    whyItMatters: 'The threshold decides which orders pay for shipping.',
    suggestedAnswers: threeAnswers,
    ...overrides,
  });
}

function withoutAnswers(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(question()).filter(([key]) => key !== 'suggestedAnswers'),
  );
}

function parsed(card: Record<string, unknown>, mode: 'required' | 'optional' = 'required') {
  return parseCardsLenient(JSON.stringify({ cards: [card] }), new Map(), {
    suggestedAnswers: mode,
  });
}

describe('RF-645 suggested answers of an OQ card', () => {
  it('RF-645 a valid card keeps three answers, the recommended one first, with its citation', () => {
    const read = parsed(question());

    expect(read.problems).toEqual([]);
    const [first, second, third] = read.drafts[0]?.suggestedAnswers ?? [];
    expect(first).toMatchObject({ answer: 'Set by the owner', recommended: true });
    expect(first?.citations).toEqual([
      { path: 'src/Orders/Shipping.cs', startLine: 12, endLine: 30 },
    ]);
    expect(second).toMatchObject({ recommended: false, citations: [] });
    expect(third?.answer).toBe('Yes, but only for domestic orders');
  });

  it('RF-645 an OQ card without suggested answers is refused with a repair message', () => {
    const read = parsed(withoutAnswers());

    expect(read.drafts).toEqual([]);
    expect(read.problems).toHaveLength(1);
    expect(read.problems[0]?.path).toBe('cards.0.suggestedAnswers');
    expect(read.problems[0]?.message).toMatch(/three suggested answers/iu);
  });

  it('RF-645 fewer than three answers is refused', () => {
    const read = parsed(question({ suggestedAnswers: threeAnswers.slice(0, 2) }));

    expect(read.drafts).toEqual([]);
    expect(read.problems[0]?.path).toBe('cards.0.suggestedAnswers');
    expect(read.problems[0]?.message).toMatch(/at least three/iu);
  });

  it('RF-645 an empty list is refused like a missing one', () => {
    expect(parsed(question({ suggestedAnswers: [] })).drafts).toEqual([]);
  });
});

describe('RF-645 the recommended answer', () => {
  it('RF-645 no answer marked recommended is refused', () => {
    const none = threeAnswers.map((each) => ({ ...each, recommended: false }));

    const read = parsed(question({ suggestedAnswers: none }));

    expect(read.drafts).toEqual([]);
    expect(read.problems[0]?.message).toMatch(/exactly one.*recommended/iu);
  });

  it('RF-645 two answers marked recommended is refused', () => {
    const two = threeAnswers.map((each, index) => ({ ...each, recommended: index < 2 }));

    expect(parsed(question({ suggestedAnswers: two })).problems[0]?.message).toMatch(
      /exactly one.*recommended/iu,
    );
  });

  it('RF-645 a recommended answer that is not listed first is refused', () => {
    const last = [threeAnswers[1], threeAnswers[2], threeAnswers[0]];

    const read = parsed(question({ suggestedAnswers: last }));

    expect(read.drafts).toEqual([]);
    expect(read.problems[0]?.message).toMatch(/listed first/iu);
  });
});

describe('RF-645 the parts of an answer', () => {
  it('RF-645 an answer without its text or its description is refused', () => {
    const rest = threeAnswers.slice(1);
    const noText = [{ recommended: true, description: 'x' }, ...rest];
    const noDescription = [answer('A', { recommended: true, description: undefined }), ...rest];

    expect(parsed(question({ suggestedAnswers: noText })).problems[0]?.path).toBe(
      'cards.0.suggestedAnswers.0.answer',
    );
    expect(parsed(question({ suggestedAnswers: noDescription })).problems[0]?.path).toBe(
      'cards.0.suggestedAnswers.0.description',
    );
  });

  it('RF-645 a citation of an answer that is not path:startLine-endLine is refused', () => {
    const bad = [
      answer('A', { recommended: true, citations: ['the shipping code'] }),
      ...threeAnswers.slice(1),
    ];

    const read = parsed(question({ suggestedAnswers: bad }));

    expect(read.drafts).toEqual([]);
    expect(read.problems[0]?.path).toBe('cards.0.suggestedAnswers.0.citations.0');
  });
});

describe('RF-645 cards of the earlier format and of other types', () => {
  it('RF-645 a card of the earlier format parses with no suggested answers', () => {
    const read = parsed(withoutAnswers(), 'optional');

    expect(read.problems).toEqual([]);
    expect(read.drafts[0]?.type).toBe('OQ');
    expect(read.drafts[0]?.suggestedAnswers).toBeUndefined();
  });

  it('RF-645 without the requirement, answers that are present are still checked', () => {
    const one = question({ suggestedAnswers: threeAnswers.slice(0, 1) });

    expect(parsed(one, 'optional').drafts).toEqual([]);
  });

  it('RF-645 the default reading does not require them', () => {
    const read = parseCardsLenient(JSON.stringify({ cards: [withoutAnswers()] }));

    expect(read.problems).toEqual([]);
  });

  it('RF-645 only an OQ card needs or keeps suggested answers', () => {
    const read = parsed(cardObject({ suggestedAnswers: threeAnswers }));

    expect(read.problems).toEqual([]);
    expect(read.drafts[0]?.suggestedAnswers).toBeUndefined();
  });

  it('RF-645 the other valid cards of the answer are kept when one OQ card is refused', () => {
    const raw = JSON.stringify({ cards: [cardObject(), withoutAnswers()] });

    const read = parseCardsLenient(raw, new Map(), required);

    expect(read.drafts.map((draft) => draft.type)).toEqual(['FEAT']);
    expect(read.problems).toHaveLength(1);
  });
});

describe('RF-645 the v3 card format and the v4 repair prompt', () => {
  it('RF-645 the example answer of card-format.v3 passes the schema with the answers required', async () => {
    const format = await readFile('prompts/cards/card-format.v3.md', 'utf8');
    const example = /```json\n([\s\S]*?)```/.exec(format)?.[1] ?? '';

    const read = parseCardsLenient(example, new Map(), required);

    expect(read.problems).toEqual([]);
    expect(read.drafts.map((draft) => draft.type)).toEqual(['BR', 'OQ']);
    expect(read.drafts[1]?.suggestedAnswers).toHaveLength(3);
  });

  it('RF-645 card-format.v3 asks for one recommended answer first and a qualified third, never filler', async () => {
    const format = await readFile('prompts/cards/card-format.v3.md', 'utf8');

    expect(format).toMatch(/exactly one answer has `recommended` true, and it is listed\s+first/iu);
    expect(format).toMatch(/applies when the question is skipped/iu);
    expect(format).toMatch(/two natural answers/iu);
    expect(format).toMatch(/qualified/iu);
    expect(format).toMatch(/never filler/iu);
  });

  it('RNF-004 the v4 repair prompt keeps its one placeholder and explains suggestedAnswers', async () => {
    const v4 = await readFile('prompts/cards/repair.v4.md', 'utf8');
    const problems = [{ path: 'cards.0.suggestedAnswers', message: 'Missing' }];

    expect(v4.match(/\{\{problems\}\}/g)).toHaveLength(1);
    expect(v4).toMatch(/suggestedAnswers/u);
    expect(renderRepairRequest(v4, problems)).toContain('- cards.0.suggestedAnswers: Missing');
  });
});
