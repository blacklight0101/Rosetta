import { describe, expect, it } from 'vitest';
import { FilePriorCards } from '../../../../src/infrastructure/cards/prior-cards.js';
import { cardsOf, writeCards } from '../../../support/card-output-harness.js';
import { flowDraft, screenDraft } from '../../../support/flow-screen-fixtures.js';

// RF-241 reads the earlier cards of a run from their files; FLOW and SCRN files are cards too.

describe('the earlier FLOW and SCRN cards of a run', () => {
  it('RF-241 are read back from the files the writer made', async () => {
    const { writer } = await writeCards(
      cardsOf([{ agentTaskId: 't', area: 'orders', drafts: [flowDraft(), screenDraft()] }]),
    );

    const cards = await new FilePriorCards(writer).cardsOf(
      { userId: 'u1', projectId: 'p' },
      '20261012-100000-understand',
    );

    expect(cards.map((card) => [card.id, card.type, card.area])).toEqual([
      ['FLOW-001', 'FLOW', 'orders'],
      ['SCRN-001', 'SCRN', 'orders'],
    ]);
  });
});
