import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { growthOf } from '../../../support/stopwatch.js';

// P3-128 (RF-141): the escaped-quote rules read a value once. Hostile input with no closing quote must
// grow about linearly. Integration level: the one real boundary is the wall clock. The masker has no
// length cap, so each shape is built at 256 KB and at 1 MB.
const oneMegabyte = 1024 * 1024;
const smallSize = oneMegabyte / 4;
/** Linear work takes about 4 times as long on 4 times the input; quadratic work about 16 times. */
const maxGrowth = 8;
const bs = String.fromCharCode(92);
const eq = `${bs}"`;

function repeatTo(size: number, piece: string): string {
  return piece.repeat(Math.ceil(size / piece.length)).slice(0, size);
}

describe('SecretMasker on escaped quotes without a closing quote', () => {
  const masker = new SecretMasker();

  it.each([
    [
      'one key then a long unclosed value',
      (size: number) => `Password=${eq}${repeatTo(size, 'a ')}`,
    ],
    [
      'one key then a long run of backslashes',
      (size: number) => `Password=${eq}${repeatTo(size, bs)}`,
    ],
    [
      'one key then backslashes and other quotes',
      (size: number) => `token=${eq}${repeatTo(size, `${bs}'`)}`,
    ],
    [
      'many keys that each open a different quote',
      (size: number) => repeatTo(size, `Password=${bs}'a Password=${eq}b `),
    ],
    [
      'many keys with a deeper-escaped quote in the value',
      (size: number) => repeatTo(size, `Password=${eq}a${bs}${bs}${bs}"b `),
    ],
    ['many opening quotes and no key', (size: number) => repeatTo(size, eq)],
    ['many keys with an empty value', (size: number) => repeatTo(size, `api_key=${eq}${eq} `)],
  ])('RF-141 masks %s in linear time', (_name, build) => {
    const { ratio } = growthOf((text) => masker.mask(text), build(smallSize), build(oneMegabyte));

    expect(ratio).toBeLessThan(maxGrowth);
  });
});
