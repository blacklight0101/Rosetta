import { describe, expect, it } from 'vitest';
import { dollarsToMicros, RUN_COST_MAX_MICROS } from '../../../web/src/lib/usd.js';

// DEC-107, DEC-117, RF-1106: the web dollar parser. Thousands separators are accepted only in
// groups of three; anything else with a comma is refused. Positive amounts above the run cost
// range (0-100 USD, DEC-117) are refused on the field. A negative amount is not refused here: it
// goes to the server, which answers RST-1003 on the field.

describe('DEC-107 comma handling', () => {
  it.each([
    ['1,200', '1200000000'],
    ['12,000.10', '12000100000'],
    ['$1,000', '1000000000'],
  ])('reads grouped thousands %s as %s micro-dollars', (text, micros) => {
    expect(dollarsToMicros(text)).toBe(micros);
  });

  it.each(['1,5', '1,2,3', '12,34', '1,5.5', ',500', '1,200,', '1,,200', '0,500', '0,001'])(
    'refuses a comma that is not a thousands group: %j',
    (text) => {
      expect(dollarsToMicros(text)).toBeUndefined();
    },
  );
});

describe('DEC-107 decimals', () => {
  it.each(['.5', '1.', '0.1234567', '1.0000001'])('refuses %j', (text) => {
    expect(dollarsToMicros(text)).toBeUndefined();
  });

  it('DEC-107 reads exactly six decimals', () => {
    expect(dollarsToMicros('0.123456')).toBe('123456');
  });
});

describe('DEC-117 run cost range', () => {
  it('DEC-117 accepts the top of the range', () => {
    expect(dollarsToMicros('100', RUN_COST_MAX_MICROS)).toBe('100000000');
  });

  it.each(['100.000001', '1,000', '100.5'])('DEC-117 refuses %j above 100 USD', (text) => {
    expect(dollarsToMicros(text, RUN_COST_MAX_MICROS)).toBeUndefined();
  });

  it('DEC-107 leaves a cap without a range unbounded above 100 USD', () => {
    expect(dollarsToMicros('12,000.10')).toBe('12000100000');
  });
});

describe('RST-1003 negative amounts reach the server', () => {
  it.each([
    ['-1', '-1000000'],
    ['-0.5', '-500000'],
    ['-$2', '-2000000'],
    ['-500', '-500000000'],
  ])('RST-1003 sends %j as %s for the server to refuse', (text, micros) => {
    expect(dollarsToMicros(text)).toBe(micros);
  });

  it.each(['-', '--1', '$-1', '-,5'])('refuses malformed %j', (text) => {
    expect(dollarsToMicros(text)).toBeUndefined();
  });

  it('RST-1003 reads a negative zero as zero', () => {
    expect(dollarsToMicros('-0')).toBe('0');
  });
});
