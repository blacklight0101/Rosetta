import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { coverageAdversarialPieces } from '../../../support/secret-coverage-innocent.js';
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

describe('SecretMasker on hostile input for the P2-43 rules', () => {
  const masker = new SecretMasker();

  it.each(coverageAdversarialPieces)('RF-141 masks repeated %j in linear time', (piece) => {
    const { ratio } = growthOf(
      (text) => masker.mask(text),
      repeatTo(smallSize, piece),
      repeatTo(oneMegabyte, piece),
    );

    expect(ratio).toBeLessThan(maxGrowth);
  });
});
