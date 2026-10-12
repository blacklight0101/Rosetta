import { describe, expect, it } from 'vitest';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { cardsOf, RunCards } from '../../../../src/application/understand/run-cards.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-203, RF-300, RF-1002: the cards of an understand run as its tasks end, possibly out of order.

function task(n: number, name: string): ReaderTask {
  return {
    agentTaskId: `reader-00${String(n)}`,
    area: {
      name,
      files: [`${name}/a.cs`],
      estimatedTokens: 1,
      mapLevel: 'coarse',
      origin: 'folder',
    },
  };
}

const tasks = [task(1, 'Catalog'), task(2, 'Orders'), task(3, 'Billing')];
const files = { files: [entry('src/Orders/Checkout.cs', 10, { lines: 40 })] };
const at = '2026-10-12T10:00:00.000Z';

describe('the cards of an understand run', () => {
  it('RF-203 gives ids in area order even when a later area ends first', () => {
    const cards = new RunCards(tasks);
    cards.record({ agentTaskId: 'reader-002', drafts: [draftOf()], withoutCards: false });
    cards.record({ agentTaskId: 'reader-001', drafts: [draftOf()], withoutCards: false });

    const checked = cards.checked(files, at);

    expect(checked.cards.map((card) => [card.id, card.agentTaskId])).toEqual([
      ['FEAT-001', 'reader-001'],
      ['FEAT-002', 'reader-002'],
    ]);
  });

  it('RF-1002 announces only the settled prefix until the run is over', () => {
    const cards = new RunCards(tasks);
    cards.record({ agentTaskId: 'reader-002', drafts: [draftOf()], withoutCards: false });

    expect([...cards.takeSettled(false)]).toEqual([]);
    cards.record({ agentTaskId: 'reader-001', drafts: [], withoutCards: true });
    expect([...cards.takeSettled(false)]).toEqual(['reader-001', 'reader-002']);
    expect([...cards.takeSettled(true)]).toEqual([]);
    expect(cards.areasWithoutCards()).toEqual(['Catalog']);
  });

  it('RF-300 the claims pass the citation check and cardsOf keeps the given tasks', () => {
    const cards = new RunCards(tasks);
    cards.record({ agentTaskId: 'reader-003', drafts: [draftOf()], withoutCards: false });

    const checked = cards.checked({ files: [] }, at);

    expect(checked.checks).toEqual([
      {
        claimId: 'FEAT-001.c1',
        ok: false,
        reason: 'src/Orders/Checkout.cs is not a file of the code map.',
      },
    ]);
    expect(cardsOf(checked.cards, new Set(['reader-001']))).toEqual([]);
  });
});
