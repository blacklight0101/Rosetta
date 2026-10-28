import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { adversarialPieces, pkcs8Begin } from '../../../support/secret-fixture.js';
import { growthOf } from '../../../support/stopwatch.js';

// Integration level: the one real boundary is the wall clock (conventions.md section 7). The masker has
// no length cap, so each hostile shape is built at 256 KB and at 1 MB and must grow about linearly.
const oneMegabyte = 1024 * 1024;
const smallSize = oneMegabyte / 4;
/** Linear work takes about 4 times as long on 4 times the input; quadratic work about 16 times. */
const maxGrowth = 8;

function repeatTo(size: number, piece: string): string {
  return piece.repeat(Math.ceil(size / piece.length)).slice(0, size);
}

function growthAt(masker: SecretMasker, build: (size: number) => string) {
  return growthOf((text) => masker.mask(text), build(smallSize), build(oneMegabyte));
}

describe('SecretMasker on hostile input', () => {
  const masker = new SecretMasker();

  it.each(adversarialPieces)('RF-141 masks repeated %j in linear time', (piece) => {
    const growth = growthAt(masker, (size) => repeatTo(size, piece));

    expect(growth.ratio).toBeLessThan(maxGrowth);
  });

  it('RF-141 masks text without line breaks after an unterminated key block in linear time', () => {
    const growth = growthAt(masker, (size) => `${pkcs8Begin}${repeatTo(size, 'A')}`);

    expect(growth.ratio).toBeLessThan(maxGrowth);
  });

  it('RF-141 masks a scheme of many parts without an @ in linear time (no length bound)', () => {
    const scheme = Array.from({ length: 16 }, () => 'a').join('-');
    const growth = growthAt(masker, (size) => `${scheme}://user:${repeatTo(size, 'x')}`);

    expect(growth.ratio).toBeLessThan(maxGrowth);
  });

  it.each([
    ['bare scheme words', 'Bearer '],
    ['quoted scheme words', "'Bearer' "],
    ['mixed scheme words and double blanks', 'Basic  "Bearer" Negotiate  '],
    ['scheme words with many blanks', `Bearer${' '.repeat(40)}`],
  ])('RF-141 masks --token and %s ending in a masked value in linear time', (_name, middle) => {
    const option = ['-', '-', 'token'].join('');
    const tail = ['[MASKED', 'bearer-token]'].join(':');
    for (const head of [`${option} `, `${option}=`]) {
      const growth = growthAt(masker, (size) => `${head}${repeatTo(size, middle)}${tail}`);

      expect(growth.ratio).toBeLessThan(maxGrowth);
    }
  });
});

describe('SecretMasker on --token scheme words before a flag or an operator', () => {
  const masker = new SecretMasker();

  it.each([' --verbose', ' > out', ' ; ls'])(
    'RF-141 masks --token and scheme words ending in %j in linear time',
    (tail) => {
      const option = ['-', '-', 'token'].join('');
      const growth = growthAt(masker, (size) => `${option} ${repeatTo(size, 'Bearer ')}${tail}`);

      expect(growth.ratio).toBeLessThan(maxGrowth);
    },
  );
});

describe('SecretMasker on --token continuations, dash values and quoted values', () => {
  const masker = new SecretMasker();
  const option = ['-', '-', 'token'].join('');
  const backslash = String.fromCharCode(92);
  const backtick = String.fromCharCode(96);
  const maskedTail = ['[MASKED', 'bearer-token]'].join(':');

  it.each([
    ['backslash continuations', `Bearer ${backslash}\n`],
    ['caret continuations with CRLF', 'Bearer ^\r\n  '],
    ['backtick continuations and blanks', `Bearer${' '.repeat(8)}${backtick}${' '.repeat(8)}\n`],
  ])('RF-141 masks --token and scheme words with %s in linear time', (_name, middle) => {
    for (const tail of [maskedTail, ' --verbose', `${backslash}\n`]) {
      const growth = growthAt(masker, (size) => `${option} ${repeatTo(size, middle)}${tail}`);

      expect(growth.ratio).toBeLessThan(maxGrowth);
    }
  });

  it.each([
    `${option} Bearer -`,
    `${option} Bearer -abcdefgh `,
    `${option} Bearer-x "`,
    `${option} Bearer-x ${backslash}\n`,
    `${option} Bearer ${backslash}\n`,
  ])('RF-141 masks repeated %j in linear time', (piece) => {
    const growth = growthAt(masker, (size) => repeatTo(size, piece));

    expect(growth.ratio).toBeLessThan(maxGrowth);
  });
});
