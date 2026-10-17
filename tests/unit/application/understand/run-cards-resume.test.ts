import { describe, expect, it } from 'vitest';
import type { ReaderTask } from '../../../../src/application/understand/reader-tasks.js';
import { RunCards } from '../../../../src/application/understand/run-cards.js';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-006, RF-203: a resumed run keeps the cards of the tasks that finished with their ids and
// numbers the new cards after them, so an id already given (in answers.md, in a discussion) never
// moves to another card.

function task(n: number, name: string): ReaderTask {
  return {
    agentTaskId: `reader-00${String(n)}`,
    area: { name, files: [], estimatedTokens: 1, mapLevel: 'coarse', origin: 'folder' },
  };
}

const files = { files: [entry('src/Orders/Checkout.cs', 10, { lines: 40 })] };
const at = '2026-10-12T10:00:00.000Z';

function keptCards() {
  const kept = assignCardIds([
    { agentTaskId: 'reader-002', area: 'Orders', drafts: [draftOf(), draftOf({ type: 'BR' })] },
  ]);
  if (!kept.ok) throw new Error('The cards were not made');
  return kept.value;
}

describe('assignCardIds after kept cards', () => {
  it('RF-006 continues each type after the highest number already given', () => {
    const cards = assignCardIds(
      [
        {
          agentTaskId: 'reader-001',
          area: 'Catalog',
          drafts: [draftOf(), draftOf({ type: 'ENT' })],
        },
      ],
      keptCards(),
    );

    expect(cards.ok && cards.value.map((card) => card.id)).toEqual(['FEAT-002', 'ENT-001']);
  });
});

describe('the cards of a resumed run', () => {
  it('RF-006 keeps the finished task cards first, unchanged, and numbers the new ones after them', () => {
    const kept = keptCards();
    const cards = new RunCards([task(1, 'Catalog')], { cards: kept, areasWithoutCards: [] });
    cards.record({ agentTaskId: 'reader-001', drafts: [draftOf()], withoutCards: false });

    const checked = cards.checked(files, at);

    expect(checked.cards.map((card) => [card.id, card.agentTaskId])).toEqual([
      ['FEAT-001', 'reader-002'],
      ['BR-001', 'reader-002'],
      ['FEAT-002', 'reader-001'],
    ]);
    expect(checked.cards.slice(0, 2)).toEqual(kept);
  });

  it('RF-006 does not check the kept claims again: their statuses stay as they were left', () => {
    const [first] = keptCards();
    if (first === undefined) throw new Error('No card');
    const unverified = {
      ...first,
      claims: first.claims.map((claim) => ({ ...claim, status: 'Unverified' as const })),
    };
    const cards = new RunCards([], { cards: [unverified], areasWithoutCards: [] });

    const checked = cards.checked({ files: [] }, at);

    expect(checked.cards).toEqual([unverified]);
    expect(checked.checks).toEqual([]);
  });

  it('RF-006 names the area of a kept task that ended with no card, with the new ones', () => {
    const cards = new RunCards([task(1, 'Catalog')], { cards: [], areasWithoutCards: ['Orders'] });
    cards.record({ agentTaskId: 'reader-001', drafts: [], withoutCards: true });

    expect(cards.areasWithoutCards()).toEqual(['Orders', 'Catalog']);
  });
});
