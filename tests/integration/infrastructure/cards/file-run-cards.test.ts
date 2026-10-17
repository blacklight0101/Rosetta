import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FileCardOutputs } from '../../../../src/infrastructure/cards/file-card-outputs.js';
import { FileRunCards } from '../../../../src/infrastructure/cards/file-run-cards.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { openWriter } from '../../../support/open-writer.js';
import { planCards } from '../../../support/plan-cards.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-604, data-model.md section 3.7: the cards of an understand run read back for `plan` in index
// order, every claim with its status and citations; a card that does not read stops the read with RST-1802.

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70';
const scope = { id: 'run-1', userId, projectId, runKey: '20261012-090000-understand' };
const runFolder = `projects/${projectId}/runs/${scope.runKey}`;

const data = useTempRoot('rosetta-run-cards-');

async function written(): Promise<ReturnType<typeof openWriter>> {
  const writer = openWriter(data.path);
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  const outputs = new FileCardOutputs({ writer, masker, logger });
  await outputs.writeCards(scope, {
    cards: planCards(),
    source: cardSource,
    areasWithoutCards: [],
  });
  return writer;
}

describe('FileRunCards: reading', () => {
  it('RF-604 reads every card of the run with each claim, its status and its citations', async () => {
    const cards = await new FileRunCards(await written()).cardsOf(scope);

    expect(cards.map((card) => card.id)).toEqual([
      'BR-001',
      'ENT-001',
      'FEAT-001',
      'FEAT-002',
      'OQ-001',
      'OQ-002',
    ]);
    expect(cards.find((card) => card.id === 'FEAT-001')).toEqual({
      ...{ id: 'FEAT-001', type: 'FEAT', title: 'Place an order', area: 'orders' },
      summary: 'Place an order, as the code shows it.',
      claims: [
        {
          claimId: 'FEAT-001.c1',
          text: 'Checkout creates an order from the basket.',
          citations: [{ path: 'src/Orders/Checkout.cs', startLine: 3, endLine: 9 }],
          status: 'Supported',
        },
        {
          claimId: 'FEAT-001.c2',
          text: 'Checkout emails the warehouse.',
          citations: [{ path: 'src/Orders/Mail.cs', startLine: 3, endLine: 9 }],
          status: 'Rejected',
        },
      ],
    });
  });

  it('RF-604 a run that wrote no card index has no cards', async () => {
    expect(await new FileRunCards(openWriter(data.path)).cardsOf(scope)).toEqual([]);
  });
});

describe('FileRunCards: refusals', () => {
  it('RF-604 a card whose citation does not read stops the read with RST-1802', async () => {
    const writer = await written();
    const path = `${runFolder}/cards/FEAT/FEAT-001.md`;
    const read = await writer.readText({ userId, path });
    const text = read.ok ? read.value : '';
    await writer.writeText({ userId, path }, text.replace('src/Orders/Checkout.cs:3-9', 'nowhere'));

    await expect(new FileRunCards(writer).cardsOf(scope)).rejects.toMatchObject({
      code: ERROR_CODES.planSourceMissing,
    });
  });

  it('RF-604 an index that names a file outside the cards stops the read with RST-1802', async () => {
    const writer = await written();
    const index = JSON.stringify({ cards: [{ path: '../../../other/cards/FEAT/FEAT-001.md' }] });
    await writer.writeText({ userId, path: `${runFolder}/cards/index.json` }, index);

    await expect(new FileRunCards(writer).cardsOf(scope)).rejects.toMatchObject({
      code: ERROR_CODES.planSourceMissing,
    });
  });
});
