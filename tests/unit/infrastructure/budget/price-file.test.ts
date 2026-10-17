import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { parsePriceTable } from '../../../../src/infrastructure/budget/price-file.js';

// RF-420, DEC-54, data-model.md section 3.18: the price table file is YAML with a dated version,
// the currency and one entry per provider kind and model, prices in integer micro-USD per million
// tokens. A file of another shape is refused, never guessed.

const valid = [
  'schemaVersion: 1',
  "version: '2026-10-11'",
  'currency: USD',
  'models:',
  '  - provider: openai',
  '    model: gpt-5-nano',
  '    inputPerMillionMicros: 50000',
  '    outputPerMillionMicros: 400000',
  '    cachedInputPerMillionMicros: 5000',
].join('\n');

function refusalOf(text: string): unknown {
  try {
    parsePriceTable(text);
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

describe('price table file', () => {
  it('RF-420 reads the version, currency and prices as integers', () => {
    expect(parsePriceTable(valid)).toEqual({
      version: '2026-10-11',
      currency: 'USD',
      prices: [
        {
          provider: 'openai',
          model: 'gpt-5-nano',
          inputPerMillionMicros: 50_000n,
          outputPerMillionMicros: 400_000n,
          cachedInputPerMillionMicros: 5_000n,
          currency: 'USD',
        },
      ],
    });
  });

  it.each([
    ['a fractional price', valid.replace('50000', '50000.5')],
    ['a negative price', valid.replace('400000', '-1')],
    ['another currency (DEC-54)', valid.replace('currency: USD', 'currency: EUR')],
    ['an unknown provider kind', valid.replace('provider: openai', 'provider: other')],
    ['an unknown key', `${valid}\nextra: 1`],
    ['a newer schema version', valid.replace('schemaVersion: 1', 'schemaVersion: 2')],
    ['an undated version', valid.replace("'2026-10-11'", 'latest')],
    ['broken YAML', 'models: [\n'],
  ])('RF-420 refuses %s with RST-1602', (_name, text) => {
    expect(refusalOf(text)).toBe(ERROR_CODES.priceTableInvalid);
  });

  it('RF-420 refuses the same provider and model twice', () => {
    const twice = `${valid}\n${valid.split('\n').slice(4).join('\n')}`;

    expect(refusalOf(twice)).toBe(ERROR_CODES.priceTableInvalid);
  });
});

describe('price table file: cache-write prices (P2-16)', () => {
  const anthropic = [
    '  - provider: anthropic',
    '    model: claude-test',
    '    inputPerMillionMicros: 3000000',
    '    outputPerMillionMicros: 15000000',
    '    cachedInputPerMillionMicros: 300000',
    '    cacheWriteInputPerMillionMicros: 3750000',
  ].join('\n');

  it('RF-420 reads a cache-write price as an integer', () => {
    const [, price] = parsePriceTable(`${valid}\n${anthropic}`).prices;

    expect(price).toEqual({
      provider: 'anthropic',
      model: 'claude-test',
      inputPerMillionMicros: 3_000_000n,
      outputPerMillionMicros: 15_000_000n,
      cachedInputPerMillionMicros: 300_000n,
      cacheWriteInputPerMillionMicros: 3_750_000n,
      currency: 'USD',
    });
  });

  it('RF-427 keeps an entry without a cache-write price without one, so the lookup can see it', () => {
    const [price] = parsePriceTable(valid).prices;

    expect(price !== undefined && 'cacheWriteInputPerMillionMicros' in price).toBe(false);
  });

  it.each([
    ['a negative cache-write price', anthropic.replace('3750000', '-1')],
    ['a fractional cache-write price', anthropic.replace('3750000', '3750000.5')],
  ])('RF-420 refuses %s with RST-1602', (_name, entry) => {
    expect(refusalOf(`${valid}\n${entry}`)).toBe(ERROR_CODES.priceTableInvalid);
  });
});
