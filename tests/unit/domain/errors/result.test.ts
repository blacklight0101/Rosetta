import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, mapOk, ok, type Result } from '../../../../src/domain/errors/result.js';

function parsePositive(input: number): Result<number, string> {
  return input > 0 ? ok(input) : err('RST-0001');
}

describe('Result', () => {
  it('RNF-013 ok wraps a value and is recognised as ok', () => {
    const result = ok(42);

    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('RNF-013 err wraps an error and is recognised as err', () => {
    const result = err('RST-0001');

    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    expect(result).toEqual({ ok: false, error: 'RST-0001' });
  });

  it('RNF-013 narrowing on ok exposes the value without a cast', () => {
    const result = parsePositive(7);

    expect(isOk(result) ? result.value : result.error).toBe(7);
  });

  it('RNF-013 narrowing on err exposes the error code without a cast', () => {
    const result = parsePositive(-1);

    expect(isErr(result) ? result.error : result.value).toBe('RST-0001');
  });

  it('RNF-013 mapOk transforms a value and leaves an error untouched', () => {
    const double = (n: number): number => n * 2;

    expect(mapOk(parsePositive(4), double)).toEqual({ ok: true, value: 8 });
    expect(mapOk(parsePositive(0), double)).toEqual({ ok: false, error: 'RST-0001' });
  });
});
