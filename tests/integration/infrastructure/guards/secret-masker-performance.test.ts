import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { adversarialPieces, pkcs8Begin } from '../../../support/secret-fixture.js';
import { elapsedMs } from '../../../support/stopwatch.js';

// Integration level: the one real boundary is the wall clock (conventions.md section 7).
const oneMegabyte = 1024 * 1024;
const budgetMs = 500;

function repeatTo(size: number, piece: string): string {
  return piece.repeat(Math.ceil(size / piece.length)).slice(0, size);
}

describe('SecretMasker on hostile input', () => {
  const masker = new SecretMasker();

  it.each(adversarialPieces)(
    `RF-141 masks 1 MB of repeated %j within ${String(budgetMs)} ms`,
    (piece) => {
      const input = repeatTo(oneMegabyte, piece);

      expect(elapsedMs(() => masker.mask(input))).toBeLessThan(budgetMs);
    },
  );

  it('RF-141 masks 1 MB of text without line breaks after an unterminated key block in budget', () => {
    const input = `${pkcs8Begin}${repeatTo(oneMegabyte, 'A')}`;

    expect(elapsedMs(() => masker.mask(input))).toBeLessThan(budgetMs);
  });

  it('RF-141 masks 1 MB without an @ after a scheme of many parts in budget (no length bound)', () => {
    const scheme = Array.from({ length: 16 }, () => 'a').join('-');
    const input = `${scheme}://user:${repeatTo(oneMegabyte, 'x')}`;

    expect(elapsedMs(() => masker.mask(input))).toBeLessThan(budgetMs);
  });

  it.each([
    ['bare scheme words', 'Bearer '],
    ['quoted scheme words', "'Bearer' "],
    ['mixed scheme words and double blanks', 'Basic  "Bearer" Negotiate  '],
    ['scheme words with many blanks', `Bearer${' '.repeat(40)}`],
  ])(
    `RF-141 masks 1 MB of --token and %s ending in a masked value within ${String(budgetMs)} ms`,
    (_name, middle) => {
      const option = ['-', '-', 'token'].join('');
      const tail = ['[MASKED', 'bearer-token]'].join(':');
      for (const head of [`${option} `, `${option}=`]) {
        const input = `${head}${middle.repeat(Math.floor(oneMegabyte / middle.length))}${tail}`;

        expect(elapsedMs(() => masker.mask(input))).toBeLessThan(budgetMs);
      }
    },
  );
});
