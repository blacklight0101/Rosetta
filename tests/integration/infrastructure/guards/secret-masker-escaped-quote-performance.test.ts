import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fastestOfMs } from '../../../support/stopwatch.js';

// P3-128 (RF-141): the escaped-quote rules read a value once. Hostile input with no closing quote
// is bounded in time. Integration level: the one real boundary is the wall clock.
const oneMegabyte = 1024 * 1024;
const budgetMs = 500;
const bs = String.fromCharCode(92);
const eq = `${bs}"`;

function repeatTo(size: number, piece: string): string {
  return piece.repeat(Math.ceil(size / piece.length)).slice(0, size);
}

describe('SecretMasker on escaped quotes without a closing quote', () => {
  const masker = new SecretMasker();

  it.each([
    ['one key then a long unclosed value', `Password=${eq}${repeatTo(oneMegabyte, 'a ')}`],
    ['one key then a long run of backslashes', `Password=${eq}${repeatTo(oneMegabyte, bs)}`],
    ['one key then backslashes and other quotes', `token=${eq}${repeatTo(oneMegabyte, `${bs}'`)}`],
    [
      'many keys that each open a different quote',
      repeatTo(oneMegabyte, `Password=${bs}'a Password=${eq}b `),
    ],
    [
      'many keys with a deeper-escaped quote in the value',
      repeatTo(oneMegabyte, `Password=${eq}a${bs}${bs}${bs}"b `),
    ],
    ['many opening quotes and no key', repeatTo(oneMegabyte, eq)],
    ['many keys with an empty value', repeatTo(oneMegabyte, `api_key=${eq}${eq} `)],
  ])(`RF-141 masks 1 MB of %s within ${String(budgetMs)} ms`, (_name, input) => {
    expect(fastestOfMs(() => masker.mask(input))).toBeLessThan(budgetMs);
  });
});
