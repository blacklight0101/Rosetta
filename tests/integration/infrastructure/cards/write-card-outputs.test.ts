import { describe, expect, it } from 'vitest';
import { writeCardOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { cardsOf } from '../../../support/card-output-harness.js';
import { openWriter } from '../../../support/open-writer.js';
import { useTempRoot } from '../../../support/temp-root.js';

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const folder = 'projects/p1/runs/20261012-100000-understand';

describe('card writers on the real output writer', () => {
  const data = useTempRoot('rosetta-cards-');

  it('RF-302 cards written to the run folder can be read back, and a rewrite keeps every claim', async () => {
    const outputs = openWriter(data.path);
    const input = { cards: cardsOf(), source: cardSource, masker: new SecretMasker() };

    const first = await writeCardOutputs(outputs, { userId, folder }, input);
    const second = await writeCardOutputs(outputs, { userId, folder }, input);

    expect(first.ok && second.ok).toBe(true);
    const index = await outputs.readText({ userId, path: `${folder}/cards/index.json` });
    const listed: unknown = index.ok ? JSON.parse(index.value) : undefined;
    expect(JSON.stringify(listed).match(/"id"/g)).toHaveLength(7);
    const card = await outputs.readText({ userId, path: `${folder}/cards/OQ/OQ-001.md` });
    expect(card.ok && card.value).toContain('Which roles may cancel a paid order?');
  });

  it('RF-005 a folder that leaves the workspace is refused', async () => {
    const result = await writeCardOutputs(
      openWriter(data.path),
      { userId, folder: '../other' },
      { cards: cardsOf(), source: cardSource, masker: new SecretMasker() },
    );

    expect(result.ok).toBe(false);
  });
});
