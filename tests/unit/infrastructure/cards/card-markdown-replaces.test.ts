import { describe, expect, it } from 'vitest';
import { renderCardFile } from '../../../../src/infrastructure/cards/card-markdown.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { cardOf, claimOf } from '../../../support/deepen-fixtures.js';

// RF-302, RF-209, data-model.md section 3.7: a claim a Deepen wrote to replace a rejected one records
// the id it replaces in the card file, in the header and in the body; any other claim has neither.

const masker = new SecretMasker();

function fileOf(replaces?: string): string {
  const extra = replaces === undefined ? {} : { replaces };
  const card = cardOf('src', [claimOf('BR-003.c1', 'Supported', ['src/a.cs'], extra)]);
  return renderCardFile(card, cardSource, masker, []);
}

describe('RF-302 the card file of a replacement', () => {
  it('RF-302 records the id the claim replaces in the header and in the body', () => {
    const file = fileOf('BR-001.c1');

    expect(file).toMatch(/^ {4}replaces: "BR-001\.c1"$/mu);
    // The id is model output, escaped like any model text in the body (ADR-013).
    expect(file).toContain('Replaces the rejected claim BR-001.c1.');
  });

  it('RF-302 writes no replaces line for a claim that replaces nothing', () => {
    expect(fileOf()).not.toMatch(/replaces/iu);
  });
});
