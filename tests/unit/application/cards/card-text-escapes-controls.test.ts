import { describe, expect, it } from 'vitest';
import { decodeTextEscapes } from '../../../../src/application/cards/card-text-escapes.js';

// P5-19 item 1 (follow-up of P5-09): the escape decoder keeps invisible direction and separator
// characters as written, and decoding twice gives what decoding once gave.

describe('decodeTextEscapes refuses invisible characters (P5-19)', () => {
  it.each([
    ['a bidi override', '\\u202e'],
    ['a left-to-right mark', '\\u200e'],
    ['a bidi isolate', '\\u2066'],
    ['a zero-width space', '\\u200b'],
    ['a zero-width joiner', '\\u200d'],
    ['a word joiner', '\\u2060'],
    ['a byte order mark', '\\ufeff'],
    ['a line separator', '\\u2028'],
    ['a paragraph separator', '\\u2029'],
  ])('%s stays as written', (_name, escape) => {
    const text = `before ${escape} after`;

    expect(decodeTextEscapes(text)).toBe(text);
  });

  it('a plain letter and a non-breaking space are still decoded', () => {
    expect(decodeTextEscapes('\\u0041\\u00a0b')).toBe('A b');
  });
});

describe('decodeTextEscapes is idempotent (P5-19)', () => {
  it.each(['\\u005cu005b', '\\u005cn', 'a \\u005cu0041 b', 'x\\u005c\\u005cu005b', '\\n\\u005cn'])(
    'decoding %j twice gives the first result',
    (text) => {
      const once = decodeTextEscapes(text);

      expect(decodeTextEscapes(once)).toBe(once);
    },
  );

  it('an escaped backslash stays an escape', () => {
    expect(decodeTextEscapes('\\u005cu005b')).toBe('\\u005cu005b');
  });
});
