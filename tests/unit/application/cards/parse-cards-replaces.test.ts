import { describe, expect, it } from 'vitest';
import { parseCardOutput } from '../../../../src/application/cards/parse-cards.js';
import { cardsJson } from '../../../support/card-output.js';

// RF-209: a re-read names the rejected claim a new claim replaces; a bad value never costs the claim.

const citations = ['src/Orders/Checkout.cs:10-24'];

describe('parseCardOutput replaces', () => {
  it('RF-209 reads the id of the claim a new claim replaces', () => {
    const raw = cardsJson({ claims: [{ text: 'It does.', citations, replaces: 'BR-001.c2' }] });

    const parsed = parseCardOutput(raw);

    expect(parsed.ok && parsed.value[0]?.claims[0]?.replaces).toBe('BR-001.c2');
  });

  it('RF-209 keeps a claim whose replaces is not text, without it', () => {
    const raw = cardsJson({ claims: [{ text: 'It does.', citations, replaces: 42 }] });

    const parsed = parseCardOutput(raw);

    expect(parsed.ok && parsed.value[0]?.claims[0]).toEqual({
      text: 'It does.',
      citations: [{ path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 }],
    });
  });
});
