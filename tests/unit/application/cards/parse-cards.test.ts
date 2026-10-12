import { describe, expect, it } from 'vitest';
import { cardLimits } from '../../../../src/application/cards/card-limits.js';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { validCardJson } from '../../../support/card-fixtures.js';

function cardWith(overrides: Record<string, unknown>): string {
  const base = {
    type: 'FEAT',
    title: 'Order checkout',
    area: 'orders',
    summary: 'The shop turns a basket into an order.',
    confidence: 'High',
    claims: [{ text: 'It creates an order.', citations: ['src/Orders/Checkout.cs:10-24'] }],
  };
  return JSON.stringify({ cards: [{ ...base, ...overrides }] });
}

function problemsOf(raw: string) {
  const parsed = parseCardOutput(raw);
  return parsed.ok ? [] : parsed.error;
}

describe('parseCardOutput accepts what small models produce', () => {
  it('RF-202 parses plain JSON into drafts with structured citations', () => {
    const parsed = parseCardOutput(validCardJson);

    expect(parsed.ok && parsed.value).toEqual([
      {
        type: 'FEAT',
        title: 'Order checkout',
        area: 'orders',
        summary: 'The shop turns a basket into an order.',
        confidence: 'High',
        claims: [
          {
            text: 'Checkout creates an order from the basket.',
            citations: [{ path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 }],
          },
        ],
      },
    ]);
  });

  it('RF-202 parses JSON inside a fenced block with prose around it', () => {
    const raw = `Here are the cards:\n\n\`\`\`json\n${validCardJson}\n\`\`\`\n\nLet me know.`;

    expect(parseCardOutput(raw).ok).toBe(true);
  });

  it('RF-202 parses a fence without a language label', () => {
    expect(parseCardOutput(`\`\`\`\n${validCardJson}\n\`\`\``).ok).toBe(true);
  });

  it('RF-202 finds the JSON object in prose without a fence, even with braces in strings', () => {
    const json = cardWith({ summary: 'Uses } and { inside text.' });

    expect(parseCardOutput(`I found this {as a note}. ${json} Done.`).ok).toBe(true);
  });

  it('RF-202 accepts line numbers written as numeric strings', () => {
    const claims = [
      {
        text: 'It creates an order.',
        citations: [{ path: 'src/a.cs', startLine: '10', endLine: ' 24 ' }],
      },
    ];

    const parsed = parseCardOutput(cardWith({ claims }));

    expect(parsed.ok && parsed.value[0]?.claims[0]?.citations).toEqual([
      { path: 'src/a.cs', startLine: 10, endLine: 24 },
    ]);
  });

  it('RF-202 accepts a bare array of cards and any letter case in type and confidence', () => {
    const raw = JSON.stringify(JSON.parse(cardWith({ type: 'br', confidence: 'medium' })).cards);

    const parsed = parseCardOutput(raw);

    expect(parsed.ok && [parsed.value[0]?.type, parsed.value[0]?.confidence]).toEqual([
      'BR',
      'Medium',
    ]);
  });

  it('RF-202 accepts an OQ card with its question and why it matters', () => {
    const raw = cardWith({ type: 'OQ', question: 'Who may cancel?', whyItMatters: 'Rules.' });

    const parsed = parseCardOutput(raw);

    expect(parsed.ok && parsed.value[0]).toMatchObject({
      question: 'Who may cancel?',
      whyItMatters: 'Rules.',
    });
  });

  it('RF-202 an answer with no cards is valid', () => {
    expect(parseCardOutput('{"cards": []}')).toEqual({ ok: true, value: [] });
  });
});

describe('parseCardOutput rejects invalid cards with located problems', () => {
  it('RF-202 a claim without a citation is rejected', () => {
    const claims = [{ text: 'x', citations: [] }];

    const problems = problemsOf(cardWith({ claims }));

    expect(problems.map((problem) => problem.path)).toContain('cards.0.claims.0.citations');
  });

  it('RF-202 a card without claims is rejected', () => {
    expect(problemsOf(cardWith({ claims: [] })).map((problem) => problem.path)).toContain(
      'cards.0.claims',
    );
  });

  it('RF-202 a citation that is not path:start-end is rejected with its position', () => {
    const claims = [{ text: 'x', citations: ['src/a.cs line 4'] }];

    expect(problemsOf(cardWith({ claims })).map((problem) => problem.path)).toContain(
      'cards.0.claims.0.citations.0',
    );
  });

  it('RF-202 a citation with its end line before its start line is rejected', () => {
    const claims = [{ text: 'x', citations: ['src/a.cs:9-3'] }];

    expect(problemsOf(cardWith({ claims })).length).toBeGreaterThan(0);
  });

  it.each([
    ['an unknown type', { type: 'RULE' }, 'cards.0.type'],
    ['an unknown confidence', { confidence: 'Sure' }, 'cards.0.confidence'],
    ['a missing title', { title: '' }, 'cards.0.title'],
    ['a missing area', { area: undefined }, 'cards.0.area'],
    ['a missing summary', { summary: undefined }, 'cards.0.summary'],
    ['an OQ without a question', { type: 'OQ', whyItMatters: 'w' }, 'cards.0.question'],
    ['an OQ without why it matters', { type: 'OQ', question: 'q' }, 'cards.0.whyItMatters'],
  ])('RF-202 %s is rejected', (_name, overrides, path) => {
    expect(problemsOf(cardWith(overrides)).map((problem) => problem.path)).toContain(path);
  });

  it('RF-202 text that holds no JSON is rejected with one problem', () => {
    expect(problemsOf('I could not find anything in this area.')).toEqual([
      { path: '', message: expect.stringContaining('JSON') },
    ]);
  });

  it('RF-202 JSON of the wrong shape is rejected', () => {
    expect(problemsOf('{"findings": []}').length).toBeGreaterThan(0);
  });
});

describe('parseCardOutput treats model output as untrusted', () => {
  it('RF-202 a __proto__ key does not pollute any object', () => {
    const raw = cardWith({}).replace('{"cards"', '{"__proto__":{"polluted":true},"cards"');

    const parsed = parseCardOutput(raw);

    expect(parsed.ok).toBe(true);
    expect(Reflect.get({}, 'polluted')).toBeUndefined();
    expect(parsed.ok && Reflect.get(parsed.value, 'polluted')).toBeUndefined();
  });

  it('RF-202 an unknown field on a card does not reach the draft', () => {
    const parsed = parseCardOutput(cardWith({ constructor: { prototype: { x: 1 } }, extra: 'y' }));

    expect(parsed.ok && Object.keys(parsed.value[0] ?? {}).sort()).toEqual([
      'area',
      'claims',
      'confidence',
      'summary',
      'title',
      'type',
    ]);
  });

  it('RF-202 output larger than the limit is refused without being parsed', () => {
    const raw = ' '.repeat(cardLimits.maxOutputChars + 1);

    expect(problemsOf(raw)[0]?.message).toMatch(/too long|larger/i);
  });

  it('RF-202 more cards than the limit are refused', () => {
    const card = JSON.parse(cardWith({})).cards[0];
    const raw = JSON.stringify({
      cards: Array.from({ length: cardLimits.maxCards + 1 }, () => card),
    });

    expect(problemsOf(raw).length).toBeGreaterThan(0);
  });

  it('RF-202 a very long text field is refused', () => {
    const summary = 'x'.repeat(cardLimits.maxSummaryChars + 1);

    expect(problemsOf(cardWith({ summary })).map((problem) => problem.path)).toContain(
      'cards.0.summary',
    );
  });

  it('RF-202 many unmatched braces are scanned in linear time', () => {
    const started = performance.now();

    const problems = problemsOf('{'.repeat(100_000));

    expect(problems.length).toBe(1);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('RF-202 reports at most the first problems, not one per field of a huge answer', () => {
    const claims = Array.from({ length: 40 }, () => ({ text: '', citations: [] }));

    expect(problemsOf(cardWith({ claims })).length).toBeLessThanOrEqual(cardLimits.maxProblems);
  });
});
