import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { parsePriceTable } from '../../../../src/infrastructure/budget/price-file.js';

// RF-420, Q-56, data-model.md section 3.18: a model entry may carry one long-prompt tier, the prices
// of a call whose input tokens are over a threshold. A tier lacking any price, a threshold that is
// not a positive whole number, or a second tier is refused, never guessed.

const tier = [
  '    longPrompt:',
  '      overInputTokens: 100000',
  '      inputPerMillionMicros: 500000',
  '      outputPerMillionMicros: 2500000',
  '      cachedInputPerMillionMicros: 50000',
  '      cacheWriteInputPerMillionMicros: 625000',
];

function fileWith(lines: readonly string[]): string {
  return [
    'schemaVersion: 1',
    "version: '2026-10-21'",
    'currency: USD',
    'models:',
    '  - provider: anthropic',
    '    model: claude-haiku-5-5',
    '    inputPerMillionMicros: 100000',
    '    outputPerMillionMicros: 500000',
    '    cachedInputPerMillionMicros: 10000',
    '    cacheWriteInputPerMillionMicros: 125000',
    ...lines,
  ].join('\n');
}

function refusalOf(text: string): unknown {
  try {
    parsePriceTable(text);
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

describe('a long-prompt tier in the price table file', () => {
  it('RF-420 reads the threshold and the prices of the tier as integers', () => {
    const [price] = parsePriceTable(fileWith(tier)).prices;

    expect(price?.longPrompt).toEqual({
      overInputTokens: 100_000,
      inputPerMillionMicros: 500_000n,
      outputPerMillionMicros: 2_500_000n,
      cachedInputPerMillionMicros: 50_000n,
      cacheWriteInputPerMillionMicros: 625_000n,
    });
  });

  it('RF-420 reads an entry without a tier as before', () => {
    expect(parsePriceTable(fileWith([])).prices[0]).not.toHaveProperty('longPrompt');
  });

  it.each([
    ['input price', 'inputPerMillionMicros: 500000'],
    ['output price', 'outputPerMillionMicros: 2500000'],
    ['cached input price', 'cachedInputPerMillionMicros: 50000'],
    ['cache-write price', 'cacheWriteInputPerMillionMicros: 625000'],
    ['threshold', 'overInputTokens: 100000'],
  ])('RF-420 refuses a tier with no %s with RST-1602', (_name, line) => {
    const without = tier.filter((each) => !each.includes(line));

    expect(without).toHaveLength(tier.length - 1);
    expect(refusalOf(fileWith(without))).toBe(ERROR_CODES.priceTableInvalid);
  });

  it.each([
    ['a zero threshold', 'overInputTokens: 100000', 'overInputTokens: 0'],
    ['a fractional threshold', 'overInputTokens: 100000', 'overInputTokens: 99999.5'],
    ['a negative tier price', 'outputPerMillionMicros: 2500000', 'outputPerMillionMicros: -1'],
    ['an unknown tier key', 'overInputTokens: 100000', 'overInputTokens: 100000\n      extra: 1'],
  ])('RF-420 refuses %s with RST-1602', (_name, from, to) => {
    const changed = tier.map((each) => each.replace(from, to));

    expect(refusalOf(fileWith(changed))).toBe(ERROR_CODES.priceTableInvalid);
  });
});
