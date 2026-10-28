import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { coverageAdversarialPieces } from '../../../support/secret-coverage-innocent.js';
import { growthOf, growthStep, maxGrowth } from '../../../support/stopwatch.js';

// Integration level: the one real boundary is the wall clock (conventions.md section 7). The masker has
// no length cap, so each hostile shape is built at 128 KB and at 2 MB (16 times) and must grow about linearly.
const smallSize = 128 * 1024;
const largeSize = smallSize * growthStep;

function repeatTo(size: number, piece: string): string {
  return piece.repeat(Math.ceil(size / piece.length)).slice(0, size);
}

describe('SecretMasker on hostile input for the P2-43 rules', () => {
  const masker = new SecretMasker();

  it.each(coverageAdversarialPieces)('RF-141 masks repeated %j in linear time', (piece) => {
    const { ratio } = growthOf(
      (text) => masker.mask(text),
      repeatTo(smallSize, piece),
      repeatTo(largeSize, piece),
    );

    expect(ratio).toBeLessThan(maxGrowth);
  });
});
