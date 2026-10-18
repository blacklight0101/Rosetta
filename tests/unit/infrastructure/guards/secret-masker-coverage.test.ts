import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { coverageInnocentTexts } from '../../../support/secret-coverage-innocent.js';
import { coverageCases } from '../../../support/secret-coverage-shapes.js';

// P2-43 (RF-141, RNF-003): secret shapes the masker missed, each with its no-false-positive texts.
const masker = new SecretMasker();
const whole = coverageCases.map((shape) => shape.text).join('\n');

describe('SecretMasker coverage of common secret shapes', () => {
  it.each(coverageCases)('RF-141 replaces $name with [MASKED:$kind]', (shape) => {
    const result = masker.mask(shape.text);

    expect(result.text).toBe(shape.masked);
    expect(result.counts[shape.kind]).toBe(1);
  });

  it.each(coverageCases)('RF-141 removes every fake value of $name', (shape) => {
    const { text } = masker.mask(shape.text);

    for (const secret of shape.secrets) {
      expect(text).not.toContain(secret);
    }
  });

  it.each(coverageCases)('RF-141 keeps the line count of $name', (shape) => {
    const input = `first\n${shape.text}\nlast`;

    expect(masker.mask(input).text).toBe(`first\n${shape.masked}\nlast`);
  });

  it('RF-141 does not mask an already masked value again', () => {
    const once = masker.mask(whole);

    const twice = masker.mask(once.text);

    expect(twice.text).toBe(once.text);
    expect(Object.values(twice.counts).every((count) => count === 0)).toBe(true);
  });

  it.each(coverageInnocentTexts)(
    'RF-141 leaves text that only looks like a secret alone: %s',
    (text) => {
      const result = masker.mask(text);

      expect(result.text).toBe(text);
      expect(Object.values(result.counts).every((count) => count === 0)).toBe(true);
    },
  );
});
