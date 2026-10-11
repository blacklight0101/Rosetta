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
});
