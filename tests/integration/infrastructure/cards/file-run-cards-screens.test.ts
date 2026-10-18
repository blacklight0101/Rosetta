import { describe, expect, it } from 'vitest';
import { FileCardOutputs } from '../../../../src/infrastructure/cards/file-card-outputs.js';
import { FileRunCards } from '../../../../src/infrastructure/cards/file-run-cards.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { openWriter } from '../../../support/open-writer.js';
import { orderScreenCards } from '../../../support/plan-screen-cards.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-626, RF-261, data-model.md section 3.7: the screen detail of a SCRN card (route, roles,
// fields, actions, where it leads) is read back for `plan` from the card file's header; the
// validations stay in the card file.

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70';
const scope = { id: 'run-1', userId, projectId, runKey: '20261012-090000-understand' };

const data = useTempRoot('rosetta-run-cards-screens-');

describe('FileRunCards: screens', () => {
  it('RF-626 reads the route, roles, fields, actions and links of a SCRN card', async () => {
    const writer = openWriter(data.path);
    const masker = new SecretMasker();
    const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
    await new FileCardOutputs({ writer, masker, logger }).writeCards(scope, {
      cards: orderScreenCards(),
      source: cardSource,
      areasWithoutCards: [],
    });

    const cards = await new FileRunCards(writer).cardsOf(scope);

    const list = cards.find((card) => card.id === 'SCRN-001');
    expect(list?.type).toBe('SCRN');
    expect(list?.screen).toEqual({
      route: '/orders',
      roles: ['Shopper', 'Staff'],
      fields: [
        { name: 'Search', inputKind: 'text', required: false },
        { name: 'Status', inputKind: 'dropdown', required: false },
      ],
      actions: [
        { label: 'Open order', handler: 'openOrder' },
        { label: 'Place order', flow: 'FLOW-001' },
      ],
      leadsTo: ['SCRN-002', '/checkout', '/ghost'],
    });
    expect(cards.find((card) => card.id === 'SCRN-004')?.screen).toMatchObject({
      ...{ route: '/fax', roles: [], fields: [] },
      ...{ actions: [], leadsTo: [] },
    });
  });
});
