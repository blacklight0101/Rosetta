import { describe, expect, it } from 'vitest';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { cardObject, cardsJson } from '../../../support/card-output.js';
import { validCardJson } from '../../../support/card-fixtures.js';

describe('parseCardOutput reads the JSON of a plain answer', () => {
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

  it('RF-202 an answer with no cards is valid', () => {
    expect(parseCardOutput('{"cards": []}')).toEqual({ ok: true, value: [] });
  });

  it('RF-202 accepts an OQ card with its question and why it matters', () => {
    const raw = cardsJson({ type: 'OQ', question: 'Who may cancel?', whyItMatters: 'Rules.' });

    const parsed = parseCardOutput(raw);

    expect(parsed.ok && parsed.value[0]).toMatchObject({
      question: 'Who may cancel?',
      whyItMatters: 'Rules.',
    });
  });
});

describe('parseCardOutput repairs what small models write', () => {
  it('RF-202 parses JSON inside a fenced block with prose around it', () => {
    const raw = `Here are the cards:\n\n\`\`\`json\n${validCardJson}\n\`\`\`\n\nLet me know.`;

    expect(parseCardOutput(raw).ok).toBe(true);
  });

  it('RF-202 parses a fence without a language label', () => {
    expect(parseCardOutput(`\`\`\`\n${validCardJson}\n\`\`\``).ok).toBe(true);
  });

  it('RF-202 finds the JSON object in prose without a fence, even with braces in strings', () => {
    const json = cardsJson({ summary: 'Uses } and { inside text.' });

    expect(parseCardOutput(`I found this {as a note}. ${json} Done.`).ok).toBe(true);
  });

  it('RF-202 accepts line numbers written as numeric strings', () => {
    const citation = { path: 'src/a.cs', startLine: '10', endLine: ' 24 ' };
    const claims = [{ text: 'It creates an order.', citations: [citation] }];

    const parsed = parseCardOutput(cardsJson({ claims }));

    expect(parsed.ok && parsed.value[0]?.claims[0]?.citations).toEqual([
      { path: 'src/a.cs', startLine: 10, endLine: 24 },
    ]);
  });

  it('RF-202 accepts a bare array of cards and any letter case in type and confidence', () => {
    const raw = JSON.stringify([cardObject({ type: 'br', confidence: 'medium' })]);

    const parsed = parseCardOutput(raw);

    expect(parsed.ok && [parsed.value[0]?.type, parsed.value[0]?.confidence]).toEqual([
      'BR',
      'Medium',
    ]);
  });
});
