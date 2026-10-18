import { describe, expect, it } from 'vitest';
import { FileCardOutputs } from '../../../../src/infrastructure/cards/file-card-outputs.js';
import { FileRunCards } from '../../../../src/infrastructure/cards/file-run-cards.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { openWriter } from '../../../support/open-writer.js';
import { supportedCards } from '../../../../src/domain/planning/plan-sources.js';
import { orderScreenCards, screenCard } from '../../../support/plan-screen-cards.js';
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

describe('FileRunCards: masked screens', () => {
  it('RF-626 ADR-005 a rejected route and rejected links with secret-looking values do not survive the masked card file', async () => {
    const writer = openWriter(data.path);
    const masker = new SecretMasker();
    const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
    // Built from pieces so no secret-looking literal sits in the file.
    const secret = ['tok', 'en=', 'abc123', 'xyz789'].join('');
    const card = screenCard({
      ...{ id: 'SCRN-001', title: 'Login', route: `/login?${secret}` },
      leadsTo: [`/next?${secret}`, '/home'],
      routeRejected: true,
      linksRejected: true,
    });
    await new FileCardOutputs({ writer, masker, logger }).writeCards(scope, {
      cards: [card],
      source: cardSource,
      areasWithoutCards: [],
    });

    const [kept] = supportedCards(await new FileRunCards(writer).cardsOf(scope));

    expect(kept?.screen?.route).toBe('');
    expect(kept?.screen?.leadsTo).toEqual([]);
  });
});
